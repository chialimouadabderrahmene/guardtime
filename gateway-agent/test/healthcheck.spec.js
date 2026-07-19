'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('healthcheck', () => {
  let tmpFile;
  let healthcheck;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `gt-hc-${Date.now()}-${Math.random()}.json`);
    process.env.HEARTBEAT_PATH = tmpFile;
    jest.resetModules();
    healthcheck = require('../src/healthcheck');
  });

  afterEach(() => {
    delete process.env.HEARTBEAT_PATH;
    delete process.env.HEARTBEAT_MAX_AGE_MS;
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  it('reports unhealthy when no heartbeat file exists', () => {
    const result = healthcheck.check();
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/no heartbeat file/);
  });

  it('reports unhealthy when the heartbeat file is corrupt', () => {
    fs.writeFileSync(tmpFile, 'not json');
    const result = healthcheck.check();
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/not valid JSON/);
  });

  it('reports healthy for a fresh heartbeat', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ lastSyncAt: new Date().toISOString(), lastSyncOk: true }));
    const result = healthcheck.check(180000);
    expect(result.healthy).toBe(true);
  });

  it('reports unhealthy for a stale heartbeat', () => {
    const staleTime = new Date(Date.now() - 10 * 60_000).toISOString();
    fs.writeFileSync(tmpFile, JSON.stringify({ lastSyncAt: staleTime, lastSyncOk: true }));
    const result = healthcheck.check(180000);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/stale/);
  });

  it('reports unhealthy when lastSyncAt is not a valid date', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ lastSyncAt: 'not-a-date' }));
    const result = healthcheck.check(180000);
    expect(result.healthy).toBe(false);
  });
});
