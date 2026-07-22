'use strict';

const { createHmac, createHash } = require('node:crypto');
const { version: AGENT_VERSION } = require('../package.json');

class BackendClient {
  constructor({ backendUrl, gatewayToken }) {
    this.backendUrl = backendUrl;
    this.gatewayToken = gatewayToken;
  }

  /**
   * Signs every request with HMAC-SHA256(gatewayToken, method\npath\n
   * timestamp\nbodyHash) — verified by GatewayTokenGuard on the backend
   * (optional there too, for older agents already deployed in the field;
   * see that guard's doc comment for the full design and its documented
   * limitation: the body hash is over JSON.stringify(parsedBody) as
   * re-serialized server-side, not the raw request bytes, so it depends on
   * both ends producing the same JSON.stringify output for the same data —
   * true for this project's flat, simple payload shapes, not a
   * general-purpose guarantee).
   */
  signRequest(method, path, body) {
    const timestamp = String(Date.now());
    const bodyForHash = body || '';
    const bodyHash = createHash('sha256').update(bodyForHash).digest('hex');
    const signedString = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = createHmac('sha256', this.gatewayToken).update(signedString).digest('hex');
    return { timestamp, signature };
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

  async reportDohDetections(detections) {
    return this.request('/gateway/doh-detections', {
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

  async request(path, options, attempt = 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const method = options.method || 'GET';
    const { timestamp, signature } = this.signRequest(method, path, options.body);

    try {
      const response = await fetch(`${this.backendUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-gateway-token': this.gatewayToken,
          'x-gateway-timestamp': timestamp,
          'x-gateway-signature': signature,
          'x-gateway-agent-version': AGENT_VERSION,
          ...(options.headers || {}),
        },
      });

      // Retry a transient failure once, within the SAME poll cycle, instead
      // of waiting a full pollIntervalMs (default 3s) for the next cycle to
      // pick it up — meaningfully cuts effective latency for a one-off
      // blip without touching the poll-and-reconcile architecture itself.
      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < 2) {
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.request(path, options, attempt + 1);
      }

      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(`backend ${response.status}: ${payload.message || text}`);
      }
      return payload;
    } catch (err) {
      if (attempt < 2 && (err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.request(path, options, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { BackendClient };
