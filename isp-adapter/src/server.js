'use strict';

const http = require('node:http');
const { loadConfig } = require('./config');
const logger = require('./logger');
const { TenantStore } = require('./tenant-store');
const { RadiusService } = require('./radius.service');
const { DhcpService } = require('./dhcp.service');
const { SubscriberResolver } = require('./subscriber-resolver');
const { BngController } = require('./bng-controller');
const { PolicyEngine } = require('./policy-engine');

const config = loadConfig();
const store = new TenantStore();
const radius = new RadiusService(store, config);
const dhcp = new DhcpService(store);
const resolver = new SubscriberResolver(store, radius, dhcp);
const bng = new BngController(store, config, logger);
const policyEngine = new PolicyEngine(store, resolver, bng);

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    logger.warn('request failed', { method: req.method, url: req.url, error: err.message });
    sendJson(res, err.statusCode || 400, { error: err.message });
  }
});

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tenantId = getTenantId(req, url);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'isp-adapter' });
  }

  if (req.method === 'GET' && url.pathname === '/isp/tenants') {
    authenticate(req);
    return sendJson(res, 200, { tenants: store.listTenants() });
  }

  if (req.method === 'POST' && url.pathname === '/isp/radius/session') {
    authenticate(req);
    const body = await readJson(req);
    const session = radius.upsertSession(body.tenantId || tenantId, body);
    return sendJson(res, 200, { session });
  }

  if (req.method === 'POST' && url.pathname === '/isp/radius/stop') {
    authenticate(req);
    const body = await readJson(req);
    const stopped = radius.stopSession(body.tenantId || tenantId, required(body.subscriberId, 'subscriberId'));
    return sendJson(res, 200, { stopped });
  }

  if (req.method === 'POST' && url.pathname === '/isp/dhcp/lease') {
    authenticate(req);
    const body = await readJson(req);
    const lease = dhcp.upsertLease(body.tenantId || tenantId, body);
    return sendJson(res, 200, { lease });
  }

  if (req.method === 'POST' && url.pathname === '/isp/policy/apply') {
    authenticate(req);
    const body = await readJson(req);
    const policy = policyEngine.apply(body.tenantId || tenantId, body);
    return sendJson(res, 200, { policy });
  }

  const subscriberMatch = url.pathname.match(/^\/isp\/subscribers\/([^/]+)$/);
  if (req.method === 'GET' && subscriberMatch) {
    authenticate(req);
    const subscriberId = decodeURIComponent(subscriberMatch[1]);
    const resolved = resolver.resolve(tenantId, { subscriberId });
    const policy = policyEngine.getPolicy(tenantId, subscriberId);
    const bngState = bng.getState(tenantId, subscriberId);
    return sendJson(res, 200, { subscriber: resolved, policy, bngState });
  }

  sendJson(res, 404, { error: 'not found' });
}

function authenticate(req) {
  if (!config.adapterToken) return;
  const token = req.headers['x-isp-adapter-token'];
  if (token !== config.adapterToken) {
    const err = new Error('invalid isp adapter token');
    err.statusCode = 401;
    throw err;
  }
}

function getTenantId(req, url) {
  return (
    req.headers['x-tenant-id'] ||
    url.searchParams.get('tenantId') ||
    config.defaultTenantId
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
}

function required(value, field) {
  if (!value) throw new Error(`${field} is required`);
  return value;
}

server.listen(config.port, () => {
  logger.info('GuardTime ISP adapter listening', {
    port: config.port,
    defaultTenantId: config.defaultTenantId,
    simulationMode: config.simulationMode,
  });
});
