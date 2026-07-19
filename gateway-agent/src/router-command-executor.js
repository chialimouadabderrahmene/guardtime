'use strict';

const { loadPlugin } = require('./router-integrations/loader');
const { discoverRouter } = require('./router-discovery');

const STRATEGY_METHOD = {
  DISCONNECT_CLIENT: 'disconnectClient',
  PAUSE_DEVICE: 'pauseDevice',
  APPLY_FIREWALL_RULE: 'applyFirewallRule',
  BLOCK_MAC: 'blockMAC',
  CHANGE_DNS: 'changeDNS',
};

// Only strategies that install a persistent block need an inverse to roll
// back if the connectivity check fails afterwards — DISCONNECT_CLIENT is
// transient (nothing to undo) and CHANGE_DNS already self-verifies and
// restores internally (see each plugin's changeDNS()).
const STRATEGY_INVERSE_METHOD = {
  PAUSE_DEVICE: 'resumeDevice',
  APPLY_FIREWALL_RULE: 'removeFirewallRule',
  BLOCK_MAC: 'unblockMAC',
};

const COMMAND_METHOD = {
  TEST_CONNECTION: 'testConnection',
  CHANGE_DNS: 'changeDNS',
  PAUSE_DEVICE: 'pauseDevice',
  RESUME_DEVICE: 'resumeDevice',
  DISCONNECT_CLIENT: 'disconnectClient',
  APPLY_FIREWALL_RULE: 'applyFirewallRule',
  REMOVE_FIREWALL_RULE: 'removeFirewallRule',
  BLOCK_MAC: 'blockMAC',
  UNBLOCK_MAC: 'unblockMAC',
};

/**
 * Polls `GET /gateway/router-commands` and executes whatever is pending
 * against the currently-configured router plugin, then acks the result back
 * (POST /gateway/router-commands/ack) — the Router Integration Engine's half
 * of the same "backend queues, gateway-agent executes + reports" pattern
 * every other layer of this agent already uses.
 *
 * Also owns periodic automatic router re-detection (SSDP/mDNS/HTTP-header/
 * OUI, read-only, no login attempted) on its own interval, independent of
 * the command queue.
 */
class RouterCommandExecutor {
  constructor({ backend, config, logger }) {
    this.backend = backend;
    this.config = config;
    this.logger = logger;
    this.lastDetectionAt = 0;
  }

  async maybeRunDetection() {
    if (!this.config.enableRouterDetection) return;
    const now = Date.now();
    if (now - this.lastDetectionAt < this.config.routerDetectionIntervalMs) return;
    this.lastDetectionAt = now;

    const detection = await discoverRouter(this.config, this.logger);
    await this.backend.reportRouterDetection(detection).catch((err) => {
      this.logger.warn('router-command-executor: failed to report detection', { error: err.message });
    });
  }

  async checkConnectivity() {
    try {
      const response = await fetch(`${this.config.backendUrl}/health`, { signal: AbortSignal.timeout(4000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  buildTarget(deviceId, payload) {
    return {
      deviceId,
      macAddress: payload?.macAddress,
      ipAddress: payload?.ipAddress,
      dnsServer: payload?.dnsServer,
    };
  }

  async executeSingleAction(plugin, ctx, methodName, target) {
    const method = plugin[methodName];
    if (typeof method !== 'function') {
      return { success: false, message: `plugin has no ${methodName} method` };
    }
    return method(ctx, target);
  }

  /** Tries each strategy in priority order; stops at the first one that both succeeds and passes a connectivity check. */
  async runEndGamingSession(plugin, ctx, { deviceId, strategies }, target) {
    const attempts = [];

    for (const strategy of strategies) {
      const methodName = STRATEGY_METHOD[strategy];
      if (!methodName) continue;

      const result = await this.executeSingleAction(plugin, ctx, methodName, target);
      attempts.push({ strategy, ...result });
      if (!result.success) continue;

      const online = await this.checkConnectivity();
      if (online) {
        return { success: true, strategyUsed: strategy, attempts };
      }

      this.logger.warn('router-command-executor: connectivity lost after strategy, rolling back', { strategy, deviceId });
      const inverseMethod = STRATEGY_INVERSE_METHOD[strategy];
      let rolledBack = false;
      if (inverseMethod) {
        const inverseResult = await this.executeSingleAction(plugin, ctx, inverseMethod, target).catch((err) => ({
          success: false,
          message: err.message,
        }));
        rolledBack = inverseResult.success === true;
        if (!rolledBack) {
          this.logger.error('router-command-executor: rollback itself failed — device may be left half-blocked', {
            strategy,
            deviceId,
            reason: inverseResult.message,
          });
        }
      }
      attempts[attempts.length - 1].rolledBack = rolledBack;
    }

    return { success: false, strategyUsed: null, attempts };
  }

  async executeCommand(command, routerConnection) {
    if (command.type === 'DETECT') {
      const detection = await discoverRouter(this.config, this.logger);
      await this.backend.reportRouterDetection(detection).catch((err) => {
        this.logger.warn('router-command-executor: failed to report re-detection', { error: err.message });
      });
      return { success: true, detection };
    }

    if (!routerConnection || !routerConnection.pluginId) {
      return { success: false, message: 'no router detected / no plugin configured for this gateway' };
    }

    const plugin = loadPlugin(routerConnection.pluginId, this.logger);
    const ctx = {
      ipAddress: routerConnection.ipAddress,
      credentials: routerConnection.credentials,
      logger: this.logger,
      dryRun: this.config.dryRun,
    };

    let payload = {};
    try {
      payload = command.payload ? JSON.parse(command.payload) : {};
    } catch {
      payload = {};
    }

    if (command.type === 'END_GAMING_SESSION') {
      const target = this.buildTarget(command.deviceId, payload);
      return this.runEndGamingSession(
        plugin,
        ctx,
        { deviceId: payload.deviceId || command.deviceId, strategies: payload.strategies || [] },
        target,
      );
    }

    const methodName = COMMAND_METHOD[command.type];
    if (!methodName) {
      return { success: false, message: `unsupported command type: ${command.type}` };
    }

    const target = this.buildTarget(command.deviceId, payload);
    return this.executeSingleAction(plugin, ctx, methodName, target);
  }

  async sync() {
    const { commands, routerConnection } = await this.backend.getRouterCommands();

    for (const command of commands) {
      try {
        const result = await this.executeCommand(command, routerConnection);
        await this.backend.ackRouterCommand(command.id, result.success === true, result);
      } catch (err) {
        this.logger.error('router-command-executor: command failed unexpectedly', {
          commandId: command.id,
          error: err.message,
        });
        await this.backend.ackRouterCommand(command.id, false, { error: err.message }).catch(() => {});
      }
    }
  }
}

module.exports = { RouterCommandExecutor, STRATEGY_METHOD, STRATEGY_INVERSE_METHOD, COMMAND_METHOD };
