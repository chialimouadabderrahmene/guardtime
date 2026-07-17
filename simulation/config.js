'use strict';

// Central config for the GuardTime Simulation Lab.
// Override via env: SIM_BASE_URL, SIM_DNS_IP, SIM_ALLOW_HEAVY.
const BASE_URL = (process.env.SIM_BASE_URL || 'https://api.waqti.pro').replace(/\/$/, '');
const DNS_IP = process.env.SIM_DNS_IP || '169.58.30.9';

// Heavy load (50–1000 devices) and server-side chaos are DESTRUCTIVE against a
// shared/production backend. They are refused unless explicitly enabled AND the
// target is clearly not production. This prevents DoSing or polluting prod.
const isProd = /waqti\.pro/i.test(BASE_URL);
const ALLOW_HEAVY = process.env.SIM_ALLOW_HEAVY === '1' && !isProd;

module.exports = {
  BASE_URL,
  DNS_IP,
  isProd,
  ALLOW_HEAVY,
  password: 'SimTest12345!',
  // Load tiers. Against prod only the smallest, paced tier runs.
  loadTiers: ALLOW_HEAVY ? [10, 50, 100, 500, 1000] : [10],
  // Per-device query volume kept modest against prod to avoid abuse.
  queriesPerDevice: ALLOW_HEAVY ? 25 : 6,
  // Seeded domains known to be in the blocklist (for block assertions).
  blockedSeedDomains: ['roblox.com', 'fortnite.com'],
};
