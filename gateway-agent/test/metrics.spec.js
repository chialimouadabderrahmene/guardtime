'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Metrics } = require('../src/metrics');

describe('Metrics', () => {
  it('inc() accumulates per-cycle counters, readable via snapshot()', () => {
    const m = new Metrics();
    m.inc('quicBlock.enforced', 2);
    m.inc('quicBlock.enforced', 3);
    expect(m.snapshot()).toEqual({ 'quicBlock.enforced': 5 });
  });

  it('flush() returns the current counters and resets them to zero', () => {
    const m = new Metrics();
    m.inc('foo', 4);
    expect(m.flush()).toEqual({ foo: 4 });
    expect(m.snapshot()).toEqual({});
  });

  it('totals stay cumulative across flush() — Prometheus counters must never reset mid-process', () => {
    const m = new Metrics();
    m.inc('foo', 4);
    m.flush(); // resets `counters`, must NOT reset `totals`
    m.inc('foo', 6);
    expect(m.totals).toEqual({ foo: 10 });
  });

  describe('writeTextfile', () => {
    let tmpFile;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `gt-metrics-${Date.now()}-${Math.random()}.prom`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpFile); } catch {}
    });

    it('writes cumulative totals in Prometheus text-exposition format', () => {
      const m = new Metrics();
      m.inc('quicBlock.enforced', 7);
      m.inc('vpnBlock.detected', 2);

      m.writeTextfile(tmpFile);
      const content = fs.readFileSync(tmpFile, 'utf8');

      expect(content).toMatch(/# HELP guardtime_gateway_agent_actions_total/);
      expect(content).toMatch(/# TYPE guardtime_gateway_agent_actions_total counter/);
      expect(content).toMatch(/guardtime_gateway_agent_actions_total\{name="quicBlock\.enforced"\} 7/);
      expect(content).toMatch(/guardtime_gateway_agent_actions_total\{name="vpnBlock\.detected"\} 2/);
    });

    it('reflects totals surviving a flush(), not the reset per-cycle counters', () => {
      const m = new Metrics();
      m.inc('foo', 5);
      m.flush();

      m.writeTextfile(tmpFile);
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toMatch(/name="foo"\} 5/);
    });

    it('creates parent directories that do not exist yet', () => {
      const nested = path.join(os.tmpdir(), `gt-metrics-dir-${Date.now()}`, 'sub', 'metrics.prom');
      const m = new Metrics();
      m.inc('foo', 1);
      expect(() => m.writeTextfile(nested)).not.toThrow();
      expect(fs.existsSync(nested)).toBe(true);
      fs.rmSync(path.dirname(path.dirname(nested)), { recursive: true, force: true });
    });

    it('overwrites the file atomically on repeated writes (no leftover temp files)', () => {
      const m = new Metrics();
      m.inc('foo', 1);
      m.writeTextfile(tmpFile);
      m.inc('foo', 1);
      m.writeTextfile(tmpFile);

      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toMatch(/name="foo"\} 2/);

      const dir = path.dirname(tmpFile);
      const leftoverTemp = fs.readdirSync(dir).filter((f) => f.includes(`.${path.basename(tmpFile)}.`));
      expect(leftoverTemp).toEqual([]);
    });
  });
});
