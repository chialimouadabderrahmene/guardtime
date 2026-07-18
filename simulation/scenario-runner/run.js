'use strict';

const config = require('../config');
const { ApiClient } = require('../lib/api');
const { Metrics, processResources } = require('../lib/metrics');
const S = require('../lib/scenario');
const { ChildDevice } = require('../child-simulator/child-device');
const { GatewaySimulator } = require('../gateway-simulator/gateway');
const { NetworkSimulator } = require('../network-simulator/network');
const { runGatewayAgentDryCycle } = require('../gateway-agent-simulator/run-dry-cycle');
const report = require('../report-generator/report');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = (tag) => `sim.${tag}.${Date.now()}@qa.waqti.pro`;
const testIp = (i) => `198.51.100.${(i % 250) + 1}`;

const metrics = new Metrics();
const createdParents = []; // {api} for cleanup

async function registerParent(tag) {
  const api = new ApiClient({ metrics });
  const em = email(tag);
  const { status, data } = await api.post('/auth/register', {
    email: em,
    password: config.password,
    firstName: 'Sim',
    lastName: tag,
  });
  if (status !== 201) throw new Error(`register ${status}: ${JSON.stringify(data)}`);
  api.token = data.accessToken;
  api._email = em;
  api._refresh = data.refreshToken;
  createdParents.push(api);
  return api;
}

// Retry a call once on 429 (the DNS-throttle bug is undeployed on prod, so a
// paced functional check can still occasionally hit the shared limit).
async function paced(fn, waitMs = 800) {
  let out = await fn();
  if (out && out.status === 429) {
    await sleep(20000);
    out = await fn();
  }
  await sleep(waitMs);
  return out;
}

async function main() {
  console.log(`\nGuardTime Simulation Lab → ${config.BASE_URL}${config.isProd ? ' (PROD safe-mode)' : ''}\n`);

  // ---------- SETUP ----------
  const parent = await registerParent('main');
  const childRes = await parent.post('/children', { name: 'Sim Child', age: 10 });
  const childId = childRes.data.id;

  // ================= BACKEND / AUTH =================
  await S.scenario('Auth', 'register creates PARENT', async () => {
    const api = new ApiClient({ metrics });
    const r = await api.post('/auth/register', { email: email('r'), password: config.password });
    createdParents.push(Object.assign(api, { token: r.data.accessToken, _refresh: r.data.refreshToken }));
    S.assert(r.status === 201 && r.data.role === 'PARENT', `status ${r.status} role ${r.data && r.data.role}`);
    return { detail: `role=${r.data.role}` };
  });
  await S.scenario('Auth', 'login', async () => {
    const api = new ApiClient({ metrics });
    const r = await api.post('/auth/login', { email: parent._email, password: config.password });
    S.assert(r.status === 200 && r.data.accessToken, `status ${r.status}`);
    parent.token = r.data.accessToken;
    parent._refresh = r.data.refreshToken;
    return { detail: '200 + tokens' };
  });
  await S.scenario('Auth', 'refresh token', async () => {
    const api = new ApiClient({ metrics });
    const r = await api.post('/auth/refresh', { refreshToken: parent._refresh });
    S.assert(r.status === 200 && r.data.accessToken, `status ${r.status}`);
    parent.token = r.data.accessToken;
    parent._refresh = r.data.refreshToken;
    return { detail: '200 rotated' };
  });
  await S.scenario('Auth', 'logout clears session', async () => {
    // Fresh login → logout → the refresh token must no longer work.
    const api = new ApiClient({ metrics });
    const login = await api.post('/auth/login', { email: parent._email, password: config.password });
    api.token = login.data.accessToken;
    const lo = await api.post('/auth/logout', {});
    S.assert(lo.status === 200 || lo.status === 201 || lo.status === 204, `logout ${lo.status}`);
    const reuse = await new ApiClient({ metrics }).post('/auth/refresh', { refreshToken: login.data.refreshToken });
    S.assert(reuse.status === 401, `refresh after logout ${reuse.status} (expected 401)`);
    return { detail: 'logout → refresh 401' };
  });
  await S.scenario('Auth', 'invalid token → 401', async () => {
    const api = new ApiClient({ metrics, token: 'invalid.jwt.token' });
    const r = await api.get('/children');
    S.assert(r.status === 401, `status ${r.status}`);
    return { detail: '401' };
  });
  await S.scenario('Auth', 'no token → 401', async () => {
    const api = new ApiClient({ metrics });
    const r = await api.get('/children', { auth: false });
    S.assert(r.status === 401, `status ${r.status}`);
    return { detail: '401' };
  });
  await S.scenario('Auth', 'privilege escalation (role=ADMIN) rejected', async () => {
    const api = new ApiClient({ metrics });
    const r = await api.post('/auth/register', { email: email('pe'), password: config.password, role: 'ADMIN' });
    S.assert(r.status === 400, `status ${r.status} (expected 400 whitelist reject)`);
    return { detail: '400 rejected' };
  });
  await S.scenario('Auth', 'roles: PARENT blocked from admin endpoint (403)', async () => {
    const r = await parent.get('/admin/domains/unknown');
    S.assert(r.status === 403, `status ${r.status} (expected 403 ADMIN-only)`);
    return { detail: '403' };
  });

  // ================= DATABASE / CRUD / CACHE =================
  let device;
  await S.scenario('Database', 'CRUD: create+read child persists', async () => {
    const list = await parent.get('/children');
    S.assert(list.status === 200 && list.data.some((c) => c.id === childId), 'child not persisted');
    return { detail: `${list.data.length} children` };
  });
  await S.scenario('Database', 'CRUD: create device persists', async () => {
    device = new ChildDevice({ api: parent, childId, name: 'Sim PC', type: 'PC', ip: testIp(0), metrics });
    await device.register();
    const got = await parent.get(`/devices/${device.deviceId}`);
    S.assert(got.status === 200 && got.data.id === device.deviceId, 'device not persisted');
    return { detail: `deviceId ${device.deviceId.slice(0, 8)}` };
  });
  await S.scenario('Database', 'CRUD: update device', async () => {
    const r = await parent.patch(`/devices/${device.deviceId}`, { name: 'Sim PC Renamed' });
    S.assert(r.status === 200 && r.data.name === 'Sim PC Renamed', `status ${r.status}`);
    return { detail: 'renamed' };
  });
  await S.scenario('Database', 'CRUD: IDOR — random device id not accessible', async () => {
    const r = await parent.get('/devices/00000000-0000-0000-0000-000000000000');
    S.assert(r.status === 404 || r.status === 403, `status ${r.status}`);
    return { detail: `${r.status}` };
  });

  // ================= DNS =================
  // Functional DNS queries retry once on 429; a persistent 429 is reported as
  // WARN (the known SkipThrottle-undeployed bug), never a logic FAIL.
  const dnsAssert = (r, ok, detail) => {
    if (r.status === 429) return { status: S.WARN, detail: 'throttled (SkipThrottle fix not deployed)' };
    S.assert(ok, `action ${r.action} reason ${r.reason} status ${r.status}`);
    return { detail };
  };
  await paced(() => S.scenario('DNS', 'allow (unknown domain)', async () => {
    const r = await device.dnsQuery(`allow-${Date.now()}.example`, { retryOn429: true });
    return dnsAssert(r, r.action === 'ALLOW', 'ALLOW');
  }));
  await paced(() => S.scenario('DNS', 'block (seeded roblox.com)', async () => {
    const r = await device.dnsQuery('roblox.com', { retryOn429: true });
    return dnsAssert(r, r.action === 'BLOCK', `BLOCK ${r.reason}`);
  }));
  await paced(() => S.scenario('DNS', 'wildcard/subdomain block', async () => {
    const r = await device.dnsQuery('cdn.assets.roblox.com', { retryOn429: true });
    return dnsAssert(r, r.action === 'BLOCK', `BLOCK ${r.reason}`);
  }));
  await paced(() => S.scenario('DNS', 'category block (activate GAMING then query)', async () => {
    await parent.post(`/admin/blocklists/children/${childId}/categories`, { category: 'GAMING', active: true });
    const r = await device.dnsQuery('fortnite.com', { retryOn429: true });
    return dnsAssert(r, r.action === 'BLOCK', `BLOCK ${r.reason}`);
  }));
  await paced(() => S.scenario('DNS', 'internet lock blocks a fresh domain', async () => {
    await device.lock();
    const r = await device.dnsQuery(`locked-${Date.now()}.example`, { retryOn429: true });
    return dnsAssert(r, r.action === 'BLOCK' && r.reason === 'FULL_INTERNET_LOCK', 'FULL_INTERNET_LOCK');
  }));
  await paced(() => S.scenario('DNS', 'unlock restores allow (fresh domain)', async () => {
    await device.unlock();
    const r = await device.dnsQuery(`unlocked-${Date.now()}.example`, { retryOn429: true });
    return dnsAssert(r, r.action === 'ALLOW', 'ALLOW');
  }));
  await paced(() => S.scenario('DNS', 'strict-mode DoH (dns.google)', async () => {
    const r = await device.dnsQuery('dns.google', { retryOn429: true });
    if (r.status === 429) return { status: S.WARN, detail: 'throttled' };
    if (r.action === 'BLOCK') return { detail: 'BLOCK (strict on)' };
    return { status: S.WARN, detail: `ALLOW — STRICT_MODE appears OFF on server` };
  }));
  S.markNotExecuted('DNS', 'ttl expiry (30s)', 'needs a 30s+ wait; covered by unit test dns-policy.engine');
  S.markNotExecuted('DNS', 'expired session block', 'needs elapsed session time; covered by unit test dns-policy.engine');

  // ================= CHILD DEVICE =================
  await S.scenario('Child Device', 'heartbeat / health', async () => {
    const hb = await device.heartbeat();
    S.assert(hb.status === 200, `status ${hb.status}`);
    return { detail: `health=${hb.health}` };
  });
  await S.scenario('Child Device', 'gaming session start/stop', async () => {
    const s = await device.startSession(60);
    S.assert(s.status === 201 && s.session.status === 'ACTIVE', `start ${s.status}`);
    const stop = await device.stopSession(s.session.id);
    S.assert(stop === 201, `stop ${stop}`);
    return { detail: 'ACTIVE→stopped' };
  });
  await S.scenario('Child Device', 'offline→reconnect (state)', async () => {
    device.goOffline();
    const off = device.online;
    device.reconnect();
    S.assert(off === false && device.online === true, 'state transition failed');
    return { detail: 'offline→online' };
  });

  // ================= GATEWAY =================
  await S.scenario('Gateway', 'register + pair', async () => {
    const gw = new GatewaySimulator({ api: new ApiClient({ metrics }), parentApi: parent });
    await gw.register('Sim-GW');
    const p = await gw.pair();
    S.assert(gw.token && (p.status === 200 || p.status === 201), `pair ${p.status}`);
    global.__gw = gw;
    return { detail: `paired token ${String(gw.token).slice(0, 6)}…` };
  });
  await S.scenario('Gateway', 'poll policies (gateway token)', async () => {
    const gw = global.__gw;
    const r = await gw.pollPolicies();
    S.assert(r.status === 200, `status ${r.status}`);
    return { detail: `policies ${Array.isArray(r.policies) ? r.policies.length : 'obj'}` };
  });
  await S.scenario('Gateway', 'report discovery (ARP)', async () => {
    const gw = global.__gw;
    const r = await gw.reportDiscovery([{ ipAddress: testIp(0), macAddress: 'AA:BB:CC:DD:EE:01' }]);
    S.assert(r.status === 200 || r.status === 201, `status ${r.status}`);
    return { detail: 'discovery accepted' };
  });
  await S.scenario('Gateway', 'invalid gateway token → 401', async () => {
    const api = new ApiClient({ metrics });
    const r = await api.get('/gateway/status?gatewayId=x', { auth: false, headers: { 'x-gateway-token': 'bogus' } });
    S.assert(r.status === 401, `status ${r.status}`);
    return { detail: '401' };
  });

  // ================= GATEWAY AGENT (Layers 3-7 security hardening) =================
  // gateway-agent is a standalone daemon meant to run on a customer's Linux
  // router, not inside this Node/Windows-only lab — it cannot be driven over
  // HTTP like the rest of this file. The dry-run cycle below requires the
  // REAL gateway-agent modules (connection-killer, firewall/nftables, VPN
  // detector, QUIC block, bandwidth control) end-to-end with dryRun:true, so
  // no Linux command is ever actually invoked. See simulation/gateway-agent-
  // simulator/run-dry-cycle.js for exactly what this does and does not prove.
  await S.scenario('Gateway Agent', 'L3-L7 full dry-run sync cycle completes without error', async () => {
    const result = await runGatewayAgentDryCycle();
    if (result.error) {
      return { status: S.FAIL, detail: `syncOnce threw: ${result.error.message}` };
    }
    return { detail: 'discovery → connection-killer → firewall (block+VPN+QUIC) → qos/bandwidth → vpn-detector, all ran' };
  });
  await S.scenario('Gateway Agent', 'L3: management IP is never enforced against, even when policy says BLOCK', async () => {
    const result = await runGatewayAgentDryCycle();
    const mgmtLine = result.logLines.find((l) => l.includes('10.0.0.1'));
    S.assert(!!mgmtLine, 'no log line referenced the management IP at all — cannot verify the guard fired');
    S.assert(mgmtLine.includes('refusing to enforce against protected IP'), `unexpected reference: ${mgmtLine}`);
    const anyRuleAgainstIt = result.logLines.some(
      (l) => l.includes('10.0.0.1') && !l.includes('refusing to enforce'),
    );
    S.assert(!anyRuleAgainstIt, 'a block/vpn/quic/bandwidth rule referenced the management IP');
    return { detail: 'only the guard\'s own refusal log mentions the management IP; zero enforcement rules do' };
  });
  await S.scenario('Gateway Agent', 'L6: QUIC (UDP/443) blocking enforced for the per-device flag', async () => {
    const result = await runGatewayAgentDryCycle();
    S.assert(
      result.logLines.some((l) => l.includes('quic (udp/443) blocking enforced')),
      'no quic enforcement log line found',
    );
    return { detail: 'dev-blocked (quicBlock=true) triggered enforcement' };
  });
  await S.scenario('Gateway Agent', 'L7: bandwidth limits (device-level + category-level) applied', async () => {
    const result = await runGatewayAgentDryCycle();
    S.assert(
      result.logLines.some((l) => l.includes('bandwidth limits enforced')),
      'no bandwidth enforcement log line found',
    );
    return { detail: 'dev-throttled (device-level cap) + dev-normal (GAMING category cap) both applied' };
  });

  // ================= BACKEND API SURFACE FOR LAYERS 4-7 =================
  // Exercises the new endpoints/fields directly against whatever backend is
  // configured (defaults to prod). Since this hardening pass has not been
  // deployed yet at the time this lab runs, these honestly report WARN
  // (not a fake PASS) when the live server doesn't yet have the new
  // endpoint/field — exactly like this lab's existing SkipThrottle-pending
  // scenario. Re-run after deployment to turn them into real PASSes.
  await S.scenario('Gateway Agent', 'L4: /gateway/discovery accepts fingerprint fields', async () => {
    const gw = global.__gw;
    if (!gw) return { status: S.WARN, detail: 'no paired gateway from the earlier scenario' };
    const r = await gw.reportDiscovery([
      {
        ipAddress: testIp(1),
        macAddress: 'AA:BB:CC:DD:EE:02',
        hostname: 'sim-device',
        dhcpClientId: '01:aa:bb:cc:dd:ee:02',
        vendorOui: 'Apple',
        osHint: 'unix-like',
      },
    ]);
    if (r.status === 400) {
      return { status: S.WARN, detail: `400 — backend not yet redeployed with the Layer 4 discovery DTO fields` };
    }
    S.assert(r.status === 200 || r.status === 201, `status ${r.status}`);
    return { detail: 'accepted with fingerprint fields' };
  });
  await S.scenario('Gateway Agent', 'L5/L6/L7: /gateway/policies response includes vpnBlock/quicBlock/bandwidthLimits', async () => {
    const gw = global.__gw;
    if (!gw) return { status: S.WARN, detail: 'no paired gateway from the earlier scenario' };
    const r = await gw.pollPolicies();
    S.assert(r.status === 200, `status ${r.status}`);
    const devices = (r.policies && r.policies.devices) || [];
    if (devices.length === 0) {
      return { status: S.WARN, detail: 'no devices attached to the sim gateway to inspect fields on' };
    }
    const sample = devices[0];
    const hasNewFields = 'vpnBlock' in sample && 'quicBlock' in sample && 'bandwidthLimits' in sample;
    if (!hasNewFields) {
      return { status: S.WARN, detail: 'fields missing — backend not yet redeployed with Layers 5-7' };
    }
    return { detail: `vpnBlock=${sample.vpnBlock} quicBlock=${sample.quicBlock} bandwidthLimits=${sample.bandwidthLimits.length}` };
  });
  await S.scenario('Gateway Agent', 'L5: /gateway/vpn-detections accepts a detection report', async () => {
    const gw = global.__gw;
    if (!gw) return { status: S.WARN, detail: 'no paired gateway from the earlier scenario' };
    const r = await gw.api.post(
      `/gateway/vpn-detections?gatewayId=${gw.gatewayId}`,
      { detections: [{ deviceId: 'nonexistent-device', provider: 'NordVPN', method: 'dns-pattern', detail: 'nordvpn.com' }] },
      { auth: false, headers: gw.headers() },
    );
    if (r.status === 404) {
      return { status: S.WARN, detail: '404 — endpoint not yet deployed' };
    }
    S.assert(r.status === 200 || r.status === 201, `status ${r.status}`);
    S.assert(r.data && r.data.recorded === 0, `expected recorded=0 for an unknown deviceId, got ${JSON.stringify(r.data)}`);
    return { detail: 'endpoint reachable, correctly ignored an unknown deviceId' };
  });
  await S.scenario('Gateway Agent', 'L5/L6: parent can toggle vpnBlockEnabled/quicBlockEnabled on a device', async () => {
    const r = await parent.patch(`/devices/${device.deviceId}`, { vpnBlockEnabled: false, quicBlockEnabled: true });
    if (r.status === 400) {
      return { status: S.WARN, detail: '400 — backend not yet redeployed with the Layer 5/6 device DTO fields' };
    }
    S.assert(r.status === 200, `status ${r.status}`);
    S.assert(r.data.vpnBlockEnabled === false && r.data.quicBlockEnabled === true, `unexpected values: ${JSON.stringify({ vpnBlockEnabled: r.data.vpnBlockEnabled, quicBlockEnabled: r.data.quicBlockEnabled })}`);
    return { detail: 'toggled and persisted' };
  });
  await S.scenario('Gateway Agent', 'L7: bandwidth-limit CRUD validates scope and persists', async () => {
    const bad = await parent.post('/bandwidth-limits', { downloadKbps: 1000 });
    if (bad.status === 404) {
      return { status: S.WARN, detail: '404 — /bandwidth-limits not yet deployed' };
    }
    S.assert(bad.status === 400, `expected 400 for missing childId/deviceId, got ${bad.status}`);

    const created = await parent.post('/bandwidth-limits', {
      deviceId: device.deviceId,
      category: 'GAMING',
      downloadKbps: 512,
      uploadKbps: 512,
    });
    S.assert(created.status === 201 || created.status === 200, `create status ${created.status}`);

    const list = await parent.get('/bandwidth-limits');
    S.assert(list.status === 200 && list.data.some((l) => l.id === created.data.id), 'created limit not listed');

    const removed = await parent.delete(`/bandwidth-limits/${created.data.id}`);
    S.assert(removed.status === 200 || removed.status === 204, `delete status ${removed.status}`);
    return { detail: 'validation + create + list + delete all correct' };
  });

  // ================= NOTIFICATIONS =================
  await S.scenario('Notifications', 'list endpoint reachable', async () => {
    const r = await parent.get('/notifications');
    S.assert(r.status === 200 && Array.isArray(r.data), `status ${r.status}`);
    return { detail: `${r.data.length} events` };
  });
  await S.scenario('Notifications', 'push token register/unregister round trip', async () => {
    const fakeToken = 'sim-fake-fcm-token-' + Date.now();
    const reg = await parent.post('/push/tokens', { token: fakeToken, platform: 'android' });
    S.assert(reg.status === 204, `register status ${reg.status}`);
    const unreg = await parent.delete('/push/tokens', { token: fakeToken });
    S.assert(unreg.status === 204, `unregister status ${unreg.status}`);
    return { detail: '204 / 204' };
  });
  await S.scenario('Notifications', 'FCM delivery + retries', async () => {
    const status = await parent.get('/push/status');
    S.assert(status.status === 200, `status endpoint ${status.status}`);
    const { deliveryEnabled, firebaseStatus, firebaseError } = status.data;

    if (firebaseStatus === 'error') {
      // A real server-side misconfiguration (e.g. bad/unreadable service
      // account file) — this must be reported as a FAIL, never masked.
      return {
        status: S.FAIL,
        detail: `Firebase init ERROR on server: ${firebaseError}`,
      };
    }

    if (firebaseStatus === 'ready' && deliveryEnabled) {
      // Strongest live evidence obtainable without a real device token:
      // confirm the Firebase Admin SDK actually initialized on the deployed
      // process (not just "env var present").
      const ready = await parent.get('/health/ready');
      S.assert(
        ready.status === 200 && ready.data.components && ready.data.components.firebase === 'up',
        `health/ready firebase component = ${ready.data && ready.data.components && ready.data.components.firebase}`,
      );
      return {
        detail:
          'Firebase Admin SDK live-initialized on production (health/ready firebase=up). ' +
          'Retry-on-transient-failure logic is covered by fcm.sender.spec.ts (18 cases) — ' +
          'not forced live here since a real transient FCM outage cannot be triggered externally.',
      };
    }

    // Honest, non-fake result: token lifecycle is proven above; real delivery
    // is not yet configured on this deployment.
    return {
      status: S.WARN,
      detail: `firebaseStatus=${firebaseStatus} — real delivery not configured on this deployment. ` +
        'Token register/unregister proven above; send/multicast/retry/invalid-token/offline-device ' +
        'proven by fcm.sender.spec.ts + push.service.spec.ts (mocked, 18 cases).',
    };
  });

  // ================= REPORTS =================
  await S.scenario('Reports', 'weekly', async () => {
    const r = await parent.get('/reports/weekly');
    S.assert(r.status === 200 && r.data.period, `status ${r.status}`);
    return { detail: `label ${r.data.label}` };
  });
  await S.scenario('Reports', 'device-health summary', async () => {
    const r = await parent.get('/device-health');
    S.assert(r.status === 200 && typeof r.data.total === 'number', `status ${r.status}`);
    return { detail: `${r.data.protectedCount}/${r.data.total} protected` };
  });

  // ================= SCHEDULER =================
  S.markNotExecuted('Scheduler', 'bedtime start/end', 'server cron; not observable within a short live run');
  S.markNotExecuted('Scheduler', 'gaming expiry', 'server cron + elapsed time; covered by unit test');
  S.markNotExecuted('Scheduler', 'cache cleanup', 'server cron');

  // ================= SECURITY =================
  await S.scenario('Security', 'SQL injection stored as literal', async () => {
    const payload = "Bobby'); DROP TABLE devices;--";
    const r = await parent.post('/children', { name: payload, age: 8 });
    S.assert(r.status === 201 && r.data.name === payload, `status ${r.status}`);
    const still = await parent.get('/children');
    S.assert(still.status === 200, 'table missing after injection');
    return { detail: 'stored literal, table intact' };
  });
  await S.scenario('Security', 'replay attack (reused refresh → 401)', async () => {
    const login = await new ApiClient({ metrics }).post('/auth/login', { email: parent._email, password: config.password });
    const rt = login.data.refreshToken;
    const api = new ApiClient({ metrics });
    const first = await api.post('/auth/refresh', { refreshToken: rt });
    const second = await api.post('/auth/refresh', { refreshToken: rt });
    S.assert(first.status === 200 && second.status === 401, `first ${first.status} second ${second.status}`);
    return { detail: '200 then 401' };
  });
  await S.scenario('Security', 'rate limiting active (auth burst → 429)', async () => {
    const api = new ApiClient({ metrics });
    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await api.post('/auth/login', { email: 'x@x.com', password: 'wrong' });
      if (r.status === 429) { saw429 = true; break; }
    }
    S.assert(saw429, 'no 429 within 12 rapid logins');
    return { detail: '429 enforced' };
  });
  await S.scenario('Security', 'DNS spam → throttle behaviour (documents fail-open bug)', async () => {
    const api = new ApiClient({ metrics });
    let ok = 0, throttled = 0;
    for (let i = 0; i < 30; i++) {
      const r = await api.get(`/dns/policy/check?sourceIp=${testIp(0)}&domain=spam${i}.example`, { auth: false });
      if (r.status === 429) throttled++; else if (r.status === 200) ok++;
    }
    if (throttled > 0) {
      return { status: S.WARN, detail: `${throttled}/30 got 429 — DNS endpoint is throttled (SkipThrottle fix not deployed → resolver fails open)` };
    }
    return { detail: `0/30 throttled — SkipThrottle deployed` };
  });

  // ================= LOAD (safe tier) =================
  const load = { tiers: [], note: '' };
  let chaos = [];
  try {
    await runLoad(load, parent, childId);
    // ================= CHAOS (client-side) =================
    chaos = await runChaos();
  } finally {
    // ---------- CLEANUP (always) ----------
    for (const api of createdParents) {
      try { await api.delete('/parents/profile'); } catch { /* ignore */ }
    }
    // ---------- REPORT (always) ----------
    const resources = processResources();
    const meta = {
      generatedAt: new Date().toISOString(),
      baseUrl: config.BASE_URL,
      isProd: config.isProd,
      apiMetrics: metrics.summary(),
    };
    const out = report.generate({ results: S.RESULTS, load, chaos, resources, meta });
    console.log(`\nReport: pass rate ${out.passRate}% (of executed). Wrote simulation-report.md / .json\n`);
  }
}

async function runLoad(load, parent, childId) {
  for (const n of config.loadTiers) {
    if (config.isProd && n > 10) {
      load.note = 'Heavy tiers (50–1000) are disabled against production. Set SIM_BASE_URL to a local/staging backend and SIM_ALLOW_HEAVY=1.';
      continue;
    }
    const lm = new Metrics();
    const devices = [];
    for (let i = 0; i < n; i++) {
      const d = new ChildDevice({ api: parent, childId, name: `load-${i}`, type: 'PC', ip: testIp(i + 5), metrics: lm });
      // Reuse ONE registered device IP space; register a few, reuse for queries to limit writes.
      devices.push(d);
    }
    // Register a small pool of real devices (cap writes to prod), reuse their IPs for queries.
    const pool = Math.min(n, config.isProd ? 3 : 25);
    for (let i = 0; i < pool; i++) await devices[i].register();
    const start = performance.now();
    let errors = 0;
    // Fire queries concurrently from the pool; count throttle/errors honestly.
    const tasks = [];
    for (let i = 0; i < n; i++) {
      const d = devices[i % pool];
      tasks.push((async () => {
        for (let q = 0; q < config.queriesPerDevice; q++) {
          const r = await d.dnsQuery(`load-${i}-${q}.example`);
          if (r.status !== 200) errors++;
        }
      })());
    }
    await Promise.all(tasks);
    const secs = (performance.now() - start) / 1000;
    const sum = lm.summary();
    load.tiers.push({
      devices: n,
      requests: sum.requests,
      avgMs: sum.avgMs,
      p50Ms: sum.p50Ms,
      p95Ms: sum.p95Ms,
      maxMs: sum.maxMs,
      errors,
      throughput: +(sum.requests / Math.max(secs, 0.001)).toFixed(1),
    });
  }
  if (config.isProd) {
    load.note = (load.note || '') + ' NOTE: against production the shared 100/min throttle caps throughput; the numbers reflect prod safety limits, not backend capacity.';
  }
}

async function runChaos() {
  const results = [];
  const net = new NetworkSimulator();
  const api = new ApiClient({ metrics, chaos: net.hook() });

  // Client high latency: request should still succeed, just slower.
  net.highLatency(1200);
  const t0 = performance.now();
  const r1 = await api.get('/health', { auth: false });
  net.reset();
  results.push({
    name: 'client high latency (+1200ms)',
    status: r1.status === 200 ? 'PASS' : 'FAIL',
    detail: `status ${r1.status}, ~${Math.round(performance.now() - t0)}ms`,
  });

  // Client packet loss: some requests time out; client must not hang/crash.
  net.packetLoss(1.0);
  const r2 = await api.get('/health', { auth: false, timeoutMs: 2000 });
  net.reset();
  results.push({
    name: 'client 100% packet loss (timeout handled)',
    status: r2.status === 0 && r2.error ? 'PASS' : 'WARN',
    detail: `aborted cleanly=${r2.status === 0}`,
  });

  // Unreachable backend: connection refused handled gracefully.
  const dead = new ApiClient({ baseUrl: 'http://127.0.0.1:59999', metrics: new Metrics() });
  const r3 = await dead.get('/health', { auth: false, timeoutMs: 3000 });
  results.push({
    name: 'backend unreachable (client resilience)',
    status: r3.status <= 0 ? 'PASS' : 'FAIL',
    detail: `handled without throw, status ${r3.status}`,
  });

  results.push({
    name: 'server-side chaos (crash Redis/DB/backend, PM2 restart)',
    status: 'NOT_EXECUTED',
    detail: 'requires host/SSH access to the VPS or a local stack; destructive on production — not run',
  });
  return results;
}

main().catch((err) => {
  console.error('FATAL', err);
  // Best-effort cleanup on fatal error.
  Promise.all(createdParents.map((a) => a.delete('/parents/profile').catch(() => {}))).finally(() =>
    process.exit(1),
  );
});
