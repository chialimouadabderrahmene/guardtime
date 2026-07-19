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

  async reportVpnDetections(detections) {
    return this.request('/gateway/vpn-detections', {
      method: 'POST',
      body: JSON.stringify({ detections }),
    });
  }

  async reportRouterDetection(detection) {
    return this.request('/gateway/router/detection', {
      method: 'POST',
      body: JSON.stringify(detection),
    });
  }

  async getRouterCommands() {
    return this.request('/gateway/router-commands', { method: 'GET' });
  }

  async ackRouterCommand(commandId, success, resultData) {
    return this.request('/gateway/router-commands/ack', {
      method: 'POST',
      body: JSON.stringify({ commandId, success, resultData }),
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
