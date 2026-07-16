'use strict';

class PolicyEngine {
  constructor(store, resolver, bngController) {
    this.store = store;
    this.resolver = resolver;
    this.bngController = bngController;
  }

  apply(tenantId, payload) {
    const resolved = this.resolver.resolve(tenantId, payload);
    const bngState = this.bngController.applyPolicy(resolved, payload);
    const tenant = this.store.getTenant(tenantId);
    const policy = {
      tenantId,
      subscriberId: resolved.subscriberId,
      action: payload.action,
      reason: payload.reason || null,
      deviceScope: payload.macAddress ? { macAddress: String(payload.macAddress).toLowerCase() } : null,
      appliedAt: bngState.appliedAt,
      resolved,
      bngState,
    };
    tenant.policies.set(resolved.subscriberId, policy);
    return policy;
  }

  getPolicy(tenantId, subscriberId) {
    return this.store.getTenant(tenantId).policies.get(subscriberId) || null;
  }
}

module.exports = { PolicyEngine };
