'use strict';

/**
 * Router Integration Engine plugin contract.
 *
 * Every vendor plugin (fritzbox/, mikrotik/, openwrt/, guide-only.js) exports
 * an object implementing every one of these methods. Each method receives a
 * `ctx` object — `{ ipAddress, credentials, logger, dryRun }` — plus a
 * method-specific `target` object, and resolves to:
 *   { success: boolean, message: string, detail?: string }
 *
 * Safety contract: a mutating method (changeDNS/pauseDevice/resumeDevice/
 * disconnectClient/applyFirewallRule/removeFirewallRule/blockMAC/unblockMAC)
 * is responsible for its OWN backup-before / verify-after / restore-on-
 * verify-failure using whatever mechanism fits its protocol (e.g. read the
 * current firewall rule list before adding one, re-read it after, delete
 * the just-added rule if it isn't there). `success: true` therefore already
 * means "verified, not just attempted."
 *
 * router-command-executor.js layers ONE more safety net on top: after any
 * successful mutating call it checks internet connectivity, and if that
 * fails, calls the paired INVERSE method (pauseDevice -> resumeDevice,
 * applyFirewallRule -> removeFirewallRule, blockMAC -> unblockMAC) to
 * restore it — this is the executor's job, not each plugin's.
 *
 * @typedef {object} PluginContext
 * @property {string} ipAddress
 * @property {{username?:string, password?:string, apiKey?:string}|null} credentials
 * @property {object} logger
 * @property {boolean} dryRun
 *
 * @typedef {object} PluginResult
 * @property {boolean} success
 * @property {string} message
 * @property {string} [detail]
 */

const REQUIRED_METHODS = [
  'detect',
  'login',
  'testConnection',
  'changeDNS',
  'pauseDevice',
  'disconnectClient',
  'resumeDevice',
  'applyFirewallRule',
  'removeFirewallRule',
  'blockMAC',
  'unblockMAC',
];

/**
 * Optional methods — every plugin CAN implement these for real (a genuine
 * session-terminating logout, a vendor-specific lightweight liveness probe),
 * but none is required at load time so the 6 pre-existing plugins keep
 * working unmodified. `withPluginDefaults()` below fills in an honest
 * fallback for whichever of these a given plugin omits, rather than leaving
 * callers to branch on `typeof plugin.health === 'function'` everywhere.
 */
const OPTIONAL_METHODS = ['logout', 'health'];

/** Throws with a clear message naming every missing method, rather than failing lazily on first use. */
function assertImplementsPluginInterface(plugin, pluginId) {
  const missing = REQUIRED_METHODS.filter((method) => typeof plugin[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(`router plugin "${pluginId}" is missing required method(s): ${missing.join(', ')}`);
  }
}

/**
 * Default logout(): most of this project's plugins re-authenticate on every
 * call rather than holding a session across calls (see openwrt/index.js's
 * login(), called fresh inside every mutating method) — for those, there is
 * no persistent session to tear down, so saying so plainly is the honest
 * answer, not a faked success. Plugins that DO hold a real server-side
 * session with a documented logout/session-destroy action (currently unifi,
 * openwrt) override this with a real one.
 */
async function defaultLogout() {
  return {
    success: true,
    message: 'no persistent session is held by this plugin (it re-authenticates per call) — nothing to log out of',
  };
}

/**
 * Default health(): a lightweight liveness signal built from the plugin's
 * OWN testConnection() (already a real, protocol-correct authenticated
 * check for every plugin) plus response latency, rather than inventing a
 * separate undocumented "health" endpoint per vendor. Plugins that expose a
 * genuinely cheaper/unauthenticated reachability probe may override this
 * with a real one (see fritzbox/openwrt detect() for that shape).
 */
function buildDefaultHealth(plugin) {
  return async function defaultHealth(ctx) {
    const startedAt = Date.now();
    const result = await plugin.testConnection(ctx);
    const latencyMs = Date.now() - startedAt;
    return { ...result, detail: result.detail ? `${result.detail} (${latencyMs}ms)` : `${latencyMs}ms` };
  };
}

/** Wraps a plugin so every OPTIONAL_METHODS entry is always callable, without mutating the original export. */
function withPluginDefaults(plugin) {
  const wrapped = { ...plugin };
  if (typeof wrapped.logout !== 'function') wrapped.logout = defaultLogout;
  if (typeof wrapped.health !== 'function') wrapped.health = buildDefaultHealth(plugin);
  return wrapped;
}

module.exports = {
  REQUIRED_METHODS,
  OPTIONAL_METHODS,
  assertImplementsPluginInterface,
  withPluginDefaults,
};
