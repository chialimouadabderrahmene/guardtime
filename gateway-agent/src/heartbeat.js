'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = process.platform === 'win32'
  ? path.join(process.cwd(), '.heartbeat.json')
  : '/var/run/guardtime-gateway-agent/heartbeat.json';

const HEARTBEAT_PATH = process.env.HEARTBEAT_PATH || DEFAULT_PATH;

/**
 * Writes a small JSON file after every poll-loop iteration (success or
 * failure) so an external watchdog — systemd, a cron job, Nagios/Icinga,
 * whatever — can tell "process is alive and looping" apart from "process
 * hung." A stale heartbeat (older than a few poll intervals) means the loop
 * itself has stopped advancing, even if the OS still shows the process
 * running.
 */
function writeHeartbeat({ ok, error, pollIntervalMs }) {
  const payload = {
    lastSyncAt: new Date().toISOString(),
    lastSyncOk: ok,
    lastError: error || null,
    pollIntervalMs,
    pid: process.pid,
  };
  try {
    fs.mkdirSync(path.dirname(HEARTBEAT_PATH), { recursive: true });
    fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(payload));
  } catch (err) {
    // Heartbeat is best-effort monitoring, not core functionality — never
    // let a failure to write it take down the actual enforcement loop.
  }
}

module.exports = { writeHeartbeat, HEARTBEAT_PATH };
