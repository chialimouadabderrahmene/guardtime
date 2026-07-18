'use strict';

const fs = require('node:fs/promises');

/**
 * Parses a dnsmasq-format lease file. Each line:
 *   <expiry-epoch> <mac> <ip> <hostname-or-*> <client-id-or-*>
 * `*` means "not reported" for that field, matching dnsmasq's own convention.
 */
function parseDhcpLeases(fileContents) {
  const leases = new Map();
  for (const line of fileContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = trimmed.split(/\s+/);
    if (fields.length < 3) continue;

    const macAddress = fields[1]?.toLowerCase();
    if (!macAddress) continue;

    const hostname = fields[3] && fields[3] !== '*' ? fields[3] : null;
    const dhcpClientId = fields[4] && fields[4] !== '*' ? fields[4] : null;

    leases.set(macAddress, { hostname, dhcpClientId });
  }
  return leases;
}

/**
 * Best-effort: DHCP lease enrichment is optional (Layer 4). If the lease
 * file isn't configured, doesn't exist yet, or fails to read, fingerprinting
 * still works from MAC/vendor-OUI alone — this never throws.
 */
async function readDhcpLeases(config, logger) {
  if (!config.dhcpLeasesFile) return new Map();

  try {
    const contents = await fs.readFile(config.dhcpLeasesFile, 'utf8');
    return parseDhcpLeases(contents);
  } catch (err) {
    logger.debug('dhcp lease file unavailable, skipping hostname/client-id enrichment', {
      file: config.dhcpLeasesFile,
      error: err.message,
    });
    return new Map();
  }
}

module.exports = { parseDhcpLeases, readDhcpLeases };
