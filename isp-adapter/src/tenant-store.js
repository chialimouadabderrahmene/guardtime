'use strict';

class TenantStore {
  constructor() {
    this.tenants = new Map();
  }

  getTenant(tenantId) {
    if (!this.tenants.has(tenantId)) {
      this.tenants.set(tenantId, {
        tenantId,
        subscribers: new Map(),
        radiusSessions: new Map(),
        dhcpLeasesByMac: new Map(),
        policies: new Map(),
        bngState: new Map(),
      });
    }
    return this.tenants.get(tenantId);
  }

  listTenants() {
    return [...this.tenants.values()].map((tenant) => ({
      tenantId: tenant.tenantId,
      subscriberCount: tenant.subscribers.size,
      activeRadiusSessions: tenant.radiusSessions.size,
      dhcpLeases: tenant.dhcpLeasesByMac.size,
      policies: tenant.policies.size,
    }));
  }
}

module.exports = { TenantStore };
