'use strict';

class DhcpService {
  constructor(store) {
    this.store = store;
  }

  upsertLease(tenantId, data) {
    const tenant = this.store.getTenant(tenantId);
    const macAddress = normalizeMac(required(data.macAddress, 'macAddress'));
    const subscriberId = required(data.subscriberId, 'subscriberId');
    const lease = {
      subscriberId,
      macAddress,
      ipAddress: required(data.ipAddress, 'ipAddress'),
      hostname: data.hostname || null,
      circuitId: data.circuitId || null,
      expiresAt: data.expiresAt || null,
      updatedAt: new Date().toISOString(),
    };

    tenant.dhcpLeasesByMac.set(macAddress, lease);
    const subscriber = ensureSubscriber(tenant, subscriberId);
    subscriber.devices.set(macAddress, lease);
    subscriber.updatedAt = new Date().toISOString();
    return lease;
  }

  listBySubscriber(tenantId, subscriberId) {
    const subscriber = this.store.getTenant(tenantId).subscribers.get(subscriberId);
    return subscriber ? [...subscriber.devices.values()] : [];
  }

  findByMac(tenantId, macAddress) {
    return this.store.getTenant(tenantId).dhcpLeasesByMac.get(normalizeMac(macAddress)) || null;
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

function normalizeMac(value) {
  return String(value).toLowerCase();
}

function required(value, field) {
  if (!value) throw new Error(`${field} is required`);
  return value;
}

module.exports = { DhcpService };
