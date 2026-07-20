'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const MAC_RE = /(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
// Link-local (fe80::/10) addresses aren't the source address real
// internet-bound traffic uses — they show up in the neighbor table from NDP
// itself, not from forwarded packets — so they're not useful as an
// enforcement target and are skipped in favor of a global/ULA address.
const IPV6_LINK_LOCAL_RE = /^fe80:/i;

function normalizeMac(value) {
  return value ? value.toLowerCase() : null;
}

/**
 * `ip neigh show` lists both IPv4 and IPv6 neighbor entries in one command,
 * one address family per line, with the address always the first token.
 * IPv6 addresses always contain a colon; IPv4 never does — that's enough to
 * tell them apart without a fragile full IPv6 regex.
 */
function parseNeighLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const mac = normalizeMac(line.match(MAC_RE)?.[0]);
  if (!mac) return null;

  const firstToken = trimmed.split(/\s+/)[0];
  if (firstToken.includes(':')) {
    if (IPV6_LINK_LOCAL_RE.test(firstToken)) return null;
    return { ipv6Address: firstToken.toLowerCase(), macAddress: mac };
  }
  const ip = firstToken.match(IPV4_RE)?.[0];
  if (!ip) return null;
  return { ipAddress: ip, macAddress: mac };
}

async function readIpNeigh(ipBin) {
  const { stdout } = await execFileAsync(ipBin, ['neigh', 'show'], { timeout: 3000 });
  return stdout.split(/\r?\n/).map(parseNeighLine).filter(Boolean);
}

async function readArp(arpBin) {
  const { stdout } = await execFileAsync(arpBin, ['-a'], { timeout: 3000 });
  return stdout
    .split(/\r?\n/)
    .map((line) => {
      const ip = line.match(IPV4_RE)?.[0];
      const mac = normalizeMac(line.match(MAC_RE)?.[0]);
      if (!ip || !mac) return null;
      return { ipAddress: ip, macAddress: mac };
    })
    .filter(Boolean);
}

async function discoverDevices(config, logger) {
  try {
    const devices = await readIpNeigh(config.ipBin);
    if (devices.length > 0) return mergeByMac(devices);
  } catch (err) {
    logger.warn('ip neigh discovery failed, falling back to arp', { error: err.message });
  }

  try {
    return mergeByMac(await readArp(config.arpBin));
  } catch (err) {
    logger.warn('arp discovery failed', { error: err.message });
    return [];
  }
}

/**
 * `ip neigh show` reports one line per address family, so the same device
 * appears twice (once for its v4 entry, once for v6). Merge those into a
 * single record per MAC carrying both addresses — this is what lets every
 * downstream controller (firewall/conntrack) apply a v6 rule alongside the
 * v4 one for the same device instead of only ever seeing whichever family's
 * line happened to parse first.
 */
function mergeByMac(entries) {
  const map = new Map();
  for (const entry of entries) {
    const existing = map.get(entry.macAddress) || { macAddress: entry.macAddress };
    if (entry.ipAddress && !existing.ipAddress) existing.ipAddress = entry.ipAddress;
    if (entry.ipv6Address && !existing.ipv6Address) existing.ipv6Address = entry.ipv6Address;
    map.set(entry.macAddress, existing);
  }
  return [...map.values()];
}

function resolvePolicyTarget(policy, discoveredDevices) {
  const normalizedMac = normalizeMac(policy.macAddress);
  const byMac = normalizedMac
    ? discoveredDevices.find((device) => device.macAddress === normalizedMac)
    : null;

  return {
    deviceId: policy.deviceId,
    name: policy.name,
    action: policy.action,
    reason: policy.reason,
    ipAddress: byMac?.ipAddress || policy.ipAddress || policy.dnsSourceIp || null,
    ipv6Address: byMac?.ipv6Address || policy.ipv6Address || null,
    macAddress: normalizedMac || byMac?.macAddress || null,
    vpnBlock: policy.vpnBlock ?? false,
    quicBlock: policy.quicBlock ?? false,
    bandwidthLimits: policy.bandwidthLimits ?? [],
  };
}

module.exports = { discoverDevices, resolvePolicyTarget };
