'use strict';

const { readDhcpLeases } = require('./dhcp-leases');
const { lookupVendor } = require('./oui-vendors');
const { detectOsHint } = require('./os-hint');

/**
 * Layer 4: enriches raw ARP/neighbour discovery entries ({ipAddress,
 * macAddress}) with the extra stable-identity fields the backend uses to
 * recognize a device across IP (and even MAC-randomization) changes:
 * hostname + DHCP client id (from the lease file, if configured), vendor
 * (from the MAC's OUI prefix), and an optional OS hint (ICMP TTL heuristic,
 * off by default). Every source here is best-effort; a device with none of
 * them still discovers and enforces exactly as before Layer 4.
 */
async function enrichWithFingerprint(discoveredDevices, config, logger) {
  if (discoveredDevices.length === 0) return discoveredDevices;

  const leases = await readDhcpLeases(config, logger);

  return Promise.all(
    discoveredDevices.map(async (device) => {
      const lease = leases.get(device.macAddress) || {};
      const osHint = await detectOsHint(device.ipAddress, config, logger);
      return {
        ...device,
        hostname: lease.hostname || null,
        dhcpClientId: lease.dhcpClientId || null,
        vendorOui: lookupVendor(device.macAddress),
        osHint,
      };
    }),
  );
}

module.exports = { enrichWithFingerprint };
