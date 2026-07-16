'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const MAC_RE = /(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

function normalizeMac(value) {
  return value ? value.toLowerCase() : null;
}

async function readIpNeigh(ipBin) {
  const { stdout } = await execFileAsync(ipBin, ['neigh', 'show'], { timeout: 3000 });
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
    if (devices.length > 0) return uniqueByMac(devices);
  } catch (err) {
    logger.warn('ip neigh discovery failed, falling back to arp', { error: err.message });
  }

  try {
    return uniqueByMac(await readArp(config.arpBin));
  } catch (err) {
    logger.warn('arp discovery failed', { error: err.message });
    return [];
  }
}

function uniqueByMac(devices) {
  const map = new Map();
  for (const device of devices) {
    map.set(device.macAddress, device);
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
    macAddress: normalizedMac || byMac?.macAddress || null,
  };
}

module.exports = { discoverDevices, resolvePolicyTarget };
