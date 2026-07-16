'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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

function loadConfig() {
  loadDotEnv();
  return {
    port: Number.parseInt(process.env.PORT || '4100', 10),
    adapterToken: process.env.ADAPTER_TOKEN || '',
    defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default-isp',
    defaultBngId: process.env.DEFAULT_BNG_ID || 'bng-01',
    simulationMode: bool('SIMULATION_MODE', true),
  };
}

module.exports = { loadConfig };
