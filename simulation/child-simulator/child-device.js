'use strict';

// A simulated child device. Backed by a REAL device row on the backend and a
// REAL parent-scoped IP. It behaves like a device: emits DNS queries (hitting
// the real policy engine), runs sessions, goes online/offline, and reconnects.
class ChildDevice {
  constructor({ api, childId, name, type = 'PC', ip, metrics }) {
    this.api = api; // authenticated ApiClient (parent token)
    this.childId = childId;
    this.name = name;
    this.type = type;
    this.ip = ip;
    this.metrics = metrics;
    this.deviceId = null;
    this.online = false;
  }

  async register() {
    const { status, data } = await this.api.post('/devices', {
      childId: this.childId,
      name: this.name,
      type: this.type,
      ipAddress: this.ip,
      controlMethod: 'DNS_FILTERING',
    });
    if (status !== 201 && status !== 200) {
      throw new Error(`device register failed (${status}): ${JSON.stringify(data)}`);
    }
    this.deviceId = data.id;
    this.online = true;
    return data;
  }

  // A DNS query against the real policy engine for this device's source IP.
  // Retries once after a pause on 429 so a shared-throttle blip (the undeployed
  // SkipThrottle fix) doesn't corrupt a functional assertion.
  async dnsQuery(domain, { retryOn429 = false } = {}) {
    const call = () =>
      this.api.get(
        `/dns/policy/check?sourceIp=${encodeURIComponent(this.ip)}&domain=${encodeURIComponent(domain)}`,
        { auth: false },
      );
    let { status, data } = await call();
    if (status === 429 && retryOn429) {
      await new Promise((r) => setTimeout(r, 12000));
      ({ status, data } = await call());
    }
    if (this.metrics) this.metrics.inc('dnsQueries');
    return { status, action: data && data.action, reason: data && data.reason };
  }

  async startSession(minutes = 60) {
    const { status, data } = await this.api.post('/sessions/start', {
      deviceId: this.deviceId,
      durationMinutes: minutes,
    });
    return { status, session: data };
  }

  async stopSession(sessionId) {
    const { status } = await this.api.post(`/sessions/${sessionId}/stop`, {});
    return status;
  }

  async lock() {
    const { status } = await this.api.post(`/devices/${this.deviceId}/internet-lock`, {
      reason: 'sim',
    });
    return status;
  }

  async unlock() {
    const { status } = await this.api.post(`/devices/${this.deviceId}/internet-unlock`, {});
    return status;
  }

  // Heartbeat: read the device's own network/health status (what the app polls).
  async heartbeat() {
    const { status, data } = await this.api.get(`/device-health/${this.deviceId}`);
    return { status, health: data && data.state };
  }

  goOffline() {
    this.online = false;
  }
  reconnect() {
    this.online = true;
  }

  // A burst of realistic random activity: mix of allowed + known-blocked domains.
  async randomActivity(count, blockedSeeds) {
    const allowed = ['news.example', 'wiki.example', 'school.example', 'mail.example'];
    const results = { allow: 0, block: 0, other: 0 };
    for (let i = 0; i < count; i++) {
      const pickBlocked = Math.random() < 0.4 && blockedSeeds.length;
      const domain = pickBlocked
        ? blockedSeeds[Math.floor(Math.random() * blockedSeeds.length)]
        : `${allowed[i % allowed.length]}`;
      const r = await this.dnsQuery(domain);
      if (r.action === 'ALLOW') results.allow++;
      else if (r.action === 'BLOCK') results.block++;
      else results.other++;
      // small jitter so we don't hammer
      await new Promise((res) => setTimeout(res, 15));
    }
    return results;
  }
}

module.exports = { ChildDevice };
