'use strict';

// Simulated Gateway Agent. Exercises the REAL gateway control plane:
// register -> pair (parent JWT), then poll /policies and report /discovery
// using the gateway token (x-gateway-token), exactly like the router daemon.
class GatewaySimulator {
  constructor({ api, parentApi }) {
    this.api = api; // ApiClient without auth (uses gateway token header)
    this.parentApi = parentApi; // authenticated parent ApiClient
    this.gatewayId = null;
    this.token = null;
    this.paired = false;
  }

  async register(name = 'Sim-Gateway') {
    const { status, data } = await this.parentApi.post('/gateway/register', { name });
    if (status !== 201 && status !== 200) {
      throw new Error(`gateway register failed (${status}): ${JSON.stringify(data)}`);
    }
    this.gatewayId = data.id;
    this.token = data.token;
    return data;
  }

  async pair() {
    const { status, data } = await this.parentApi.post('/gateway/pair', {
      gatewayId: this.gatewayId,
    });
    this.paired = status === 200 || status === 201;
    return { status, data };
  }

  headers() {
    return { 'x-gateway-token': this.token };
  }

  async pollPolicies() {
    const { status, data } = await this.api.get(
      `/gateway/policies?gatewayId=${this.gatewayId}`,
      { auth: false, headers: this.headers() },
    );
    return { status, policies: data };
  }

  async reportDiscovery(devices) {
    const { status, data } = await this.api.post(
      `/gateway/discovery?gatewayId=${this.gatewayId}`,
      { devices },
      { auth: false, headers: this.headers() },
    );
    return { status, data };
  }

  async status() {
    const { status, data } = await this.api.get(
      `/gateway/status?gatewayId=${this.gatewayId}`,
      { auth: false, headers: this.headers() },
    );
    return { status, data };
  }
}

module.exports = { GatewaySimulator };
