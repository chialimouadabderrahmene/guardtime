'use strict';

class RadiusService {
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }

  upsertSession(tenantId, data) {
    const tenant = this.store.getTenant(tenantId);
    const session = {
      subscriberId: required(data.subscriberId, 'subscriberId'),
      assignedIp: required(data.assignedIp, 'assignedIp'),
      publicIp: data.publicIp || null,
      cgnatPortStart: data.cgnatPortStart ?? null,
      cgnatPortEnd: data.cgnatPortEnd ?? null,
      bngId: data.bngId || this.config.defaultBngId,
      accessCircuitId: data.accessCircuitId || null,
      startedAt: data.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: data.active ?? true,
    };

    tenant.radiusSessions.set(session.subscriberId, session);
    ensureSubscriber(tenant, session.subscriberId).activeSession = session;
    return session;
  }

  stopSession(tenantId, subscriberId) {
    const tenant = this.store.getTenant(tenantId);
    const session = tenant.radiusSessions.get(subscriberId);
    if (!session) return null;
    session.active = false;
    session.stoppedAt = new Date().toISOString();
    tenant.radiusSessions.delete(subscriberId);
    const subscriber = ensureSubscriber(tenant, subscriberId);
    subscriber.activeSession = null;
    return session;
  }

  getSession(tenantId, subscriberId) {
    return this.store.getTenant(tenantId).radiusSessions.get(subscriberId) || null;
  }
}

function ensureSubscriber(tenant, subscriberId) {
  if (!tenant.subscribers.has(subscriberId)) {
    tenant.subscribers.set(subscriberId, {
      subscriberId,
      activeSession: null,
      devices: new Map(),
      updatedAt: new Date().toISOString(),
    });
  }
  return tenant.subscribers.get(subscriberId);
}

function required(value, field) {
  if (!value) throw new Error(`${field} is required`);
  return value;
}

module.exports = { RadiusService };
