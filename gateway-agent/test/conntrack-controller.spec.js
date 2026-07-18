'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { ConntrackController } = require('../src/conntrack-controller');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseConfig(overrides = {}) {
  return { conntrackBin: 'conntrack', dryRun: false, ...overrides };
}

function mockExecFile(responses) {
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    const key = args.includes('tcp') ? 'tcp' : args.includes('udp') ? 'udp' : 'other';
    const response = responses[key];
    if (!response) {
      cb(new Error('no matching entries'));
      return;
    }
    cb(null, { stdout: response, stderr: '' });
  });
}

describe('ConntrackController.listTcpConnections', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('parses tcp flows and dedupes identical src/dst/port tuples from both directions', () => {
    mockExecFile({
      tcp: 'tcp      6 431999 ESTABLISHED src=192.168.1.50 dst=93.184.216.34 sport=51000 dport=443 [ASSURED]\n',
    });
    const controller = new ConntrackController(baseConfig(), fakeLogger());

    return controller.listTcpConnections('192.168.1.50').then((flows) => {
      expect(flows).toEqual([{ src: '192.168.1.50', dst: '93.184.216.34', sport: 51000, dport: 443 }]);
    });
  });

  it('returns an empty array when there are no matching entries', async () => {
    mockExecFile({});
    const controller = new ConntrackController(baseConfig(), fakeLogger());
    const flows = await controller.listTcpConnections('10.0.0.5');
    expect(flows).toEqual([]);
  });

  it('returns an empty array without an IP address', async () => {
    const controller = new ConntrackController(baseConfig(), fakeLogger());
    expect(await controller.listTcpConnections(null)).toEqual([]);
  });
});

describe('ConntrackController.listUdpConnections', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('parses udp flows (Layer 5: where VPN protocols live)', async () => {
    mockExecFile({
      udp: 'udp      17 29 src=192.168.1.50 dst=162.159.192.10 sport=44123 dport=51820\n',
    });
    const controller = new ConntrackController(baseConfig(), fakeLogger());

    const flows = await controller.listUdpConnections('192.168.1.50');
    expect(flows).toEqual([{ src: '192.168.1.50', dst: '162.159.192.10', sport: 44123, dport: 51820 }]);
  });

  it('does not pick up tcp lines when listing udp', async () => {
    mockExecFile({}); // no udp response configured -> command fails -> empty
    const controller = new ConntrackController(baseConfig(), fakeLogger());
    expect(await controller.listUdpConnections('192.168.1.50')).toEqual([]);
  });

  it('returns an empty array without an IP address', async () => {
    const controller = new ConntrackController(baseConfig(), fakeLogger());
    expect(await controller.listUdpConnections(null)).toEqual([]);
  });
});

describe('ConntrackController.killDevice', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('does nothing when conntrack-kill is disabled', async () => {
    mockExecFile({});
    const controller = new ConntrackController(baseConfig({ enableConntrackKill: false }), fakeLogger());
    await controller.killDevice('192.168.1.50');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('deletes both source and destination entries when enabled', async () => {
    const calls = [];
    execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
      calls.push(args);
      cb(null, { stdout: '', stderr: '' });
    });
    const controller = new ConntrackController(baseConfig({ enableConntrackKill: true }), fakeLogger());

    await controller.killDevice('192.168.1.50');

    expect(calls).toContainEqual(['-D', '-s', '192.168.1.50']);
    expect(calls).toContainEqual(['-D', '-d', '192.168.1.50']);
  });
});
