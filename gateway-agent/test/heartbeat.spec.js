'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('heartbeat', () => {
  let tmpFile;
  let heartbeat;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `gt-heartbeat-${Date.now()}-${Math.random()}.json`);
    process.env.HEARTBEAT_PATH = tmpFile;
    jest.resetModules();
    heartbeat = require('../src/heartbeat');
  });

  afterEach(() => {
    delete process.env.HEARTBEAT_PATH;
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  it('writes a heartbeat file with the expected shape on success', () => {
    heartbeat.writeHeartbeat({ ok: true, pollIntervalMs: 60000 });
    const written = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    expect(written.lastSyncOk).toBe(true);
    expect(written.lastError).toBeNull();
    expect(written.pollIntervalMs).toBe(60000);
    expect(typeof written.lastSyncAt).toBe('string');
    expect(written.pid).toBe(process.pid);
  });

  it('records the error message on failure', () => {
    heartbeat.writeHeartbeat({ ok: false, error: 'backend unreachable', pollIntervalMs: 60000 });
    const written = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    expect(written.lastSyncOk).toBe(false);
    expect(written.lastError).toBe('backend unreachable');
  });

  it('creates parent directories that do not exist yet', () => {
    const nested = path.join(os.tmpdir(), `gt-hb-dir-${Date.now()}`, 'sub', 'heartbeat.json');
    process.env.HEARTBEAT_PATH = nested;
    jest.resetModules();
    const hb = require('../src/heartbeat');
    expect(() => hb.writeHeartbeat({ ok: true, pollIntervalMs: 1000 })).not.toThrow();
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(path.dirname(nested)), { recursive: true, force: true });
  });

  it('does not throw if the write path is unwritable', () => {
    process.env.HEARTBEAT_PATH = 'Z:\\definitely\\not\\a\\real\\drive\\heartbeat.json';
    jest.resetModules();
    const hb = require('../src/heartbeat');
    expect(() => hb.writeHeartbeat({ ok: true, pollIntervalMs: 1000 })).not.toThrow();
  });
});
