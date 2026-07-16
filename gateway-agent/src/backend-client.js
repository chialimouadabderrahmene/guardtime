'use strict';

class BackendClient {
  constructor({ backendUrl, gatewayToken }) {
    this.backendUrl = backendUrl;
    this.gatewayToken = gatewayToken;
  }

  async getPolicies() {
    return this.request('/gateway/policies', { method: 'GET' });
  }

  async reportDiscovery(devices) {
    return this.request('/gateway/discovery', {
      method: 'POST',
      body: JSON.stringify({ devices }),
    });
  }

  async request(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.backendUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-gateway-token': this.gatewayToken,
          ...(options.headers || {}),
        },
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(`backend ${response.status}: ${payload.message || text}`);
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { BackendClient };
