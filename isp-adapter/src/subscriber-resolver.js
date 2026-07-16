'use strict';

class SubscriberResolver {
  constructor(store, radiusService, dhcpService) {
    this.store = store;
    this.radiusService = radiusService;
    this.dhcpService = dhcpService;
  }

  resolve(tenantId, input) {
    const tenant = this.store.getTenant(tenantId);
    const subscriberId = input.subscriberId || this.resolveSubscriberIdFromDevice(tenantId, input);
    if (!subscriberId) {
      throw new Error('subscriberId is required or must be resolvable from macAddress');
    }

    const subscriber = tenant.subscribers.get(subscriberId) || {
      subscriberId,
      activeSession: null,
      devices: new Map(),
      updatedAt: new Date().toISOString(),
    };
    tenant.subscribers.set(subscriberId, subscriber);

    const radiusSession = this.radiusService.getSession(tenantId, subscriberId);
    const devices = this.dhcpService.listBySubscriber(tenantId, subscriberId);

    return {
      tenantId,
      subscriberId,
      radiusSession,
      devices,
      enforcementIp: radiusSession?.assignedIp || input.assignedIp || devices[0]?.ipAddress || null,
      publicIp: radiusSession?.publicIp || null,
      cgnat: radiusSession?.publicIp
        ? {
            publicIp: radiusSession.publicIp,
            portStart: radiusSession.cgnatPortStart,
            portEnd: radiusSession.cgnatPortEnd,
          }
        : null,
      bngId: radiusSession?.bngId || input.bngId || null,
    };
  }

  resolveSubscriberIdFromDevice(tenantId, input) {
    if (!input.macAddress) return null;
    return this.dhcpService.findByMac(tenantId, input.macAddress)?.subscriberId || null;
  }
}

module.exports = { SubscriberResolver };
