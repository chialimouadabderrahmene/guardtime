'use strict';

const { BASE_URL } = require('../config');

// HTTP client over Node's global fetch. Records latency + status into an
// optional Metrics instance, and supports client-side chaos (latency/timeout
// injection) via the `chaos` hook for the network simulator.
class ApiClient {
  constructor({ baseUrl = BASE_URL, token = null, metrics = null, chaos = null } = {}) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.metrics = metrics;
    this.chaos = chaos; // async (req) => void | throws
  }

  async request(method, path, { body, headers = {}, auth = true, timeoutMs = 15000 } = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (auth && this.token) h.Authorization = `Bearer ${this.token}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = performance.now();
    let status = 0;
    let data = null;
    let error = null;
    try {
      // Chaos runs INSIDE the try so an injected fault is captured as a failed
      // request (status 0), never propagated to crash the caller.
      if (this.chaos) await this.chaos({ method, path });
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      status = res.status;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
    } catch (err) {
      error = err;
      status = err.name === 'AbortError' ? 0 : -1;
    } finally {
      clearTimeout(timer);
      const ms = performance.now() - start;
      if (this.metrics) this.metrics.record(ms, status);
    }
    return { status, data, error };
  }

  get(path, opts) {
    return this.request('GET', path, opts);
  }
  post(path, body, opts) {
    return this.request('POST', path, { body, ...opts });
  }
  patch(path, body, opts) {
    return this.request('PATCH', path, { body, ...opts });
  }
  delete(path, body, opts) {
    return this.request('DELETE', path, { body, ...opts });
  }
}

module.exports = { ApiClient };
