'use strict';

class BngController {
  constructor(store, config, logger) {
    this.store = store;
    this.config = config;
    this.logger = logger;
  }

  applyPolicy(resolved, policy) {
    if (!resolved.enforcementIp) {
      throw new Error(`No enforceable IP for subscriber ${resolved.subscriberId}`);
    }

    const tenant = this.store.getTenant(resolved.tenantId);
    const key = `${resolved.bngId || this.config.defaultBngId}:${resolved.subscriberId}`;
    const action = normalizeAction(policy.action);
    const state = {
      tenantId: resolved.tenantId,
      subscriberId: resolved.subscriberId,
      bngId: resolved.bngId || this.config.defaultBngId,
      action,
      enforcementIp: resolved.enforcementIp,
      publicIp: resolved.publicIp,
      cgnat: resolved.cgnat,
      qosProfile: this.qosProfileFor(action),
      blackhole: action === 'BLOCK',
      dnsPolicy: action,
      reason: policy.reason || null,
      appliedAt: new Date().toISOString(),
      vendorCommands: this.buildVendorCommands(resolved, action),
    };

    tenant.bngState.set(key, state);
    this.logger.info('BNG policy applied', {
      tenantId: state.tenantId,
      subscriberId: state.subscriberId,
      bngId: state.bngId,
      action,
      enforcementIp: state.enforcementIp,
      publicIp: state.publicIp,
      cgnat: state.cgnat,
    });
    return state;
  }

  getState(tenantId, subscriberId) {
    const tenant = this.store.getTenant(tenantId);
    return [...tenant.bngState.values()].filter((state) => state.subscriberId === subscriberId);
  }

  buildVendorCommands(resolved, action) {
    const ip = resolved.enforcementIp;
    if (action === 'BLOCK') {
      return [
        `ip route add blackhole ${ip}/32`,
        `radius CoA: subscriber=${resolved.subscriberId} Filter-Id=guardtime-block`,
        `dns-policy set subscriber=${resolved.subscriberId} action=BLOCK`,
      ];
    }
    if (action === 'THROTTLE') {
      return [
        `radius CoA: subscriber=${resolved.subscriberId} QoS-Profile=guardtime-1kbit`,
        `bng qos set subscriber=${resolved.subscriberId} rate=1kbit`,
        `dns-policy set subscriber=${resolved.subscriberId} action=THROTTLE`,
      ];
    }
    return [
      `ip route del blackhole ${ip}/32 || true`,
      `radius CoA: subscriber=${resolved.subscriberId} Filter-Id=default`,
      `bng qos clear subscriber=${resolved.subscriberId}`,
      `dns-policy set subscriber=${resolved.subscriberId} action=ALLOW`,
    ];
  }

  qosProfileFor(action) {
    if (action === 'THROTTLE') return 'guardtime-1kbit';
    if (action === 'BLOCK') return 'guardtime-blackhole';
    return 'default';
  }
}

function normalizeAction(action) {
  if (!['BLOCK', 'ALLOW', 'THROTTLE'].includes(action)) {
    throw new Error('action must be BLOCK, ALLOW, or THROTTLE');
  }
  return action;
}

module.exports = { BngController };
