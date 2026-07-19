#!/usr/bin/env node
'use strict';

// Standalone watchdog check: exits 0 if the poll loop has written a heartbeat
// within the last `maxAgeMs` window, 1 otherwise. Meant to be invoked by
// systemd (ExecStartPre health probe / a separate timer unit), a cron job,
// or an external monitoring agent — the gateway-agent process itself has no
// HTTP surface by design (it's a privileged network daemon; adding a listen
// port here would widen its attack surface for no real benefit).
const fs = require('fs');
const { HEARTBEAT_PATH } = require('./heartbeat');

const DEFAULT_MAX_AGE_MS = 3 * 60_000; // 3 poll intervals at the 60s default

function check(maxAgeMs = Number(process.env.HEARTBEAT_MAX_AGE_MS) || DEFAULT_MAX_AGE_MS) {
  let raw;
  try {
    raw = fs.readFileSync(HEARTBEAT_PATH, 'utf8');
  } catch {
    return { healthy: false, reason: `no heartbeat file at ${HEARTBEAT_PATH}` };
  }

  let heartbeat;
  try {
    heartbeat = JSON.parse(raw);
  } catch {
    return { healthy: false, reason: 'heartbeat file is not valid JSON' };
  }

  const ageMs = Date.now() - new Date(heartbeat.lastSyncAt).getTime();
  if (Number.isNaN(ageMs) || ageMs > maxAgeMs) {
    return { healthy: false, reason: `heartbeat is stale (${Math.round(ageMs / 1000)}s old)`, heartbeat };
  }

  return { healthy: true, heartbeat };
}

if (require.main === module) {
  const result = check();
  if (result.healthy) {
    console.log(`OK — last sync ${result.heartbeat.lastSyncAt} (ok=${result.heartbeat.lastSyncOk})`);
    process.exit(0);
  } else {
    console.error(`UNHEALTHY — ${result.reason}`);
    process.exit(1);
  }
}

module.exports = { check };
