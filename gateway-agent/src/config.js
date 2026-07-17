'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function bool(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function loadConfig() {
  loadDotEnv();

  const config = {
    // The gateway agent runs on the customer's router, so it reaches the
    // backend over the public internet.
    backendUrl: (process.env.BACKEND_URL || 'https://api.waqti.pro').replace(/\/$/, ''),
    gatewayToken: process.env.GATEWAY_TOKEN || '',
    pollIntervalMs: int('POLL_INTERVAL_MS', 3000),
    dnsRedirectIp: process.env.DNS_REDIRECT_IP || '',
    enableDnsRedirect: bool('ENABLE_DNS_REDIRECT', true),
    dryRun: bool('DRY_RUN', false),
    iptablesBin: process.env.IPTABLES_BIN || 'iptables',
    conntrackBin: process.env.CONNTRACK_BIN || 'conntrack',
    tcBin: process.env.TC_BIN || 'tc',
    pythonBin: process.env.PYTHON_BIN || 'python3',
    ipBin: process.env.IP_BIN || 'ip',
    arpBin: process.env.ARP_BIN || 'arp',
    enableConntrackKill: bool('ENABLE_CONNTRACK_KILL', true),
    enableTcpRst: bool('ENABLE_TCP_RST', true),
    tcpRstSniffMs: int('TCP_RST_SNIFF_MS', 700),
    enableQos: bool('ENABLE_QOS', true),
    qosRate: process.env.QOS_RATE || '1kbit',
    qosDefaultRate: process.env.QOS_DEFAULT_RATE || '1000mbit',
    qosInterfaces: (process.env.QOS_INTERFACES || '')
      .split(',')
      .map((iface) => iface.trim())
      .filter(Boolean),
  };

  if (!config.gatewayToken) {
    throw new Error('GATEWAY_TOKEN is required');
  }
  if (config.enableDnsRedirect && !config.dnsRedirectIp) {
    throw new Error('DNS_REDIRECT_IP is required when ENABLE_DNS_REDIRECT=true');
  }

  return config;
}

module.exports = { loadConfig };
