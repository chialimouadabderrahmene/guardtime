'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const TTL_RE = /ttl=(\d+)/i;

/**
 * Classifies a received ICMP TTL into a coarse OS family. Initial TTLs are
 * conventionally 64 (Linux/macOS/iOS/Android), 128 (Windows), or 255 (network
 * gear/older Unix); a LAN hop or two decrements the observed value, so each
 * bucket has headroom below the nominal value. Best-effort only — many
 * devices/firewalls block ICMP entirely, which just yields 'unknown'.
 */
function classifyTtl(ttl) {
  if (ttl >= 200) return 'network-device';
  if (ttl >= 110) return 'windows';
  if (ttl >= 32) return 'unix-like';
  return 'unknown';
}

/** Never throws — returns null when the device doesn't answer ICMP at all. */
async function detectOsHint(ipAddress, config, logger) {
  if (!config.enableOsHint || !ipAddress) return null;

  try {
    const timeoutSeconds = Math.max(1, Math.ceil(config.osHintTimeoutMs / 1000));
    const { stdout } = await execFileAsync(
      config.pingBin,
      ['-c', '1', '-W', String(timeoutSeconds), ipAddress],
      { timeout: config.osHintTimeoutMs + 500 },
    );
    const match = stdout.match(TTL_RE);
    if (!match) return null;
    return classifyTtl(Number.parseInt(match[1], 10));
  } catch (err) {
    logger.debug('os-hint: ping failed (device may block ICMP)', { ipAddress, error: err.message });
    return null;
  }
}

module.exports = { detectOsHint, classifyTtl };
