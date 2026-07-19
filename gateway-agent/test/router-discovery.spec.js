'use strict';

const { EventEmitter } = require('node:events');

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('node:dgram', () => ({ createSocket: jest.fn() }));

const { execFile } = require('node:child_process');
const dgram = require('node:dgram');

const {
  discoverRouter,
  getDefaultGatewayIp,
  getGatewayMac,
  parseSsdpResponse,
  ssdpDiscover,
  httpHeaderProbe,
  mdnsProbe,
  identifyVendorFromText,
  buildMdnsQuery,
} = require('../src/router-discovery');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function mockExecFileStdout(stdout) {
  execFile.mockImplementation((...args) => {
    const cb = args[args.length - 1];
    cb(null, { stdout, stderr: '' });
  });
}

function fakeSocket() {
  const socket = new EventEmitter();
  socket.bind = jest.fn((cb) => cb());
  socket.send = jest.fn();
  socket.close = jest.fn();
  socket.addMembership = jest.fn();
  return socket;
}

describe('pure helpers', () => {
  it('parseSsdpResponse lowercases header names and trims values', () => {
    const headers = parseSsdpResponse('HTTP/1.1 200 OK\r\nSERVER: FRITZ!OS UPnP/1.0 AVM FRITZ!Box 7590\r\nLOCATION: http://192.168.178.1:49000/\r\n');
    expect(headers.server).toBe('FRITZ!OS UPnP/1.0 AVM FRITZ!Box 7590');
    expect(headers.location).toBe('http://192.168.178.1:49000/');
  });

  it.each([
    ['FRITZ!OS UPnP/1.0 AVM FRITZ!Box 7590', 'AVM'],
    ['RouterOS', 'MikroTik'],
    ['OpenWrt 23.05 LuCI', 'OpenWrt'],
    ['UniFi Dream Machine', 'Ubiquiti'],
    ['GL.iNet GL-MT6000', 'GL.iNet'],
    ['ASUSWRT', 'ASUS'],
    ['NETGEAR R7000', 'Netgear'],
    ['D-Link DIR-882', 'D-Link'],
    ['Linksys Velop', 'Linksys'],
    ['Synology RT6600ax', 'Synology'],
  ])('identifyVendorFromText("%s") -> %s', (text, expected) => {
    expect(identifyVendorFromText(text)).toBe(expected);
  });

  it('identifyVendorFromText returns null for unrecognized or empty text', () => {
    expect(identifyVendorFromText('Totally Unknown Device')).toBeNull();
    expect(identifyVendorFromText('')).toBeNull();
    expect(identifyVendorFromText(null)).toBeNull();
  });

  it('buildMdnsQuery produces a well-formed DNS header with QDCOUNT=1', () => {
    const packet = buildMdnsQuery();
    expect(packet.readUInt16BE(4)).toBe(1); // QDCOUNT
    expect(packet.length).toBeGreaterThan(12);
  });
});

describe('getDefaultGatewayIp', () => {
  beforeEach(() => execFile.mockReset());

  it('parses the default gateway IP from "ip route show default"', async () => {
    mockExecFileStdout('default via 192.168.1.1 dev eth0 proto dhcp metric 100\n');
    expect(await getDefaultGatewayIp({ ipBin: 'ip' }, fakeLogger())).toBe('192.168.1.1');
  });

  it('returns null (never throws) when the command fails', async () => {
    execFile.mockImplementation((...args) => args[args.length - 1](new Error('command not found')));
    expect(await getDefaultGatewayIp({ ipBin: 'ip' }, fakeLogger())).toBeNull();
  });

  it('returns null when no default route line is present', async () => {
    mockExecFileStdout('10.0.0.0/24 dev eth0 scope link\n');
    expect(await getDefaultGatewayIp({ ipBin: 'ip' }, fakeLogger())).toBeNull();
  });
});

describe('getGatewayMac', () => {
  beforeEach(() => execFile.mockReset());

  it('parses the MAC address from "ip neigh show"', async () => {
    mockExecFileStdout('192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n');
    expect(await getGatewayMac('192.168.1.1', { ipBin: 'ip' }, fakeLogger())).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('returns null (never throws) on failure', async () => {
    execFile.mockImplementation((...args) => args[args.length - 1](new Error('boom')));
    expect(await getGatewayMac('192.168.1.1', { ipBin: 'ip' }, fakeLogger())).toBeNull();
  });
});

describe('httpHeaderProbe', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('identifies a vendor from the Server header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      headers: new Map([['server', 'FRITZ!OS UPnP/1.0 AVM FRITZ!Box 7590']]),
      text: async () => '<html><title>FRITZ!Box 7590</title></html>',
    });
    // Map doesn't have a .get(key) fallback issue since we used a real Map.
    const result = await httpHeaderProbe('192.168.178.1', fakeLogger());
    expect(result.vendor).toBe('AVM');
    expect(result.detail).toBe('FRITZ!Box 7590');
  });

  it('falls back to scanning the body when headers give no hint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      headers: new Map(),
      text: async () => '<html><title>OpenWrt LuCI</title></html>',
    });
    const result = await httpHeaderProbe('192.168.1.1', fakeLogger());
    expect(result.vendor).toBe('OpenWrt');
  });

  it('returns vendor:null (never throws) when the probe fails entirely', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    const result = await httpHeaderProbe('192.168.1.1', fakeLogger());
    expect(result).toEqual({ vendor: null, detail: null });
  });
});

describe('ssdpDiscover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    dgram.createSocket.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('collects SSDP responses only from the gateway IP within the time window', async () => {
    const socket = fakeSocket();
    dgram.createSocket.mockReturnValue(socket);

    const promise = ssdpDiscover('192.168.1.1', fakeLogger(), 500);
    socket.emit('message', Buffer.from('SERVER: RouterOS\r\n'), { address: '192.168.1.1' });
    socket.emit('message', Buffer.from('SERVER: SomeOtherDevice\r\n'), { address: '192.168.1.55' });
    jest.advanceTimersByTime(500);

    const responses = await promise;
    expect(responses).toEqual([{ server: 'RouterOS' }]);
    expect(socket.close).toHaveBeenCalled();
  });

  it('resolves to an empty array (never throws) on a socket error', async () => {
    const socket = fakeSocket();
    dgram.createSocket.mockReturnValue(socket);

    const promise = ssdpDiscover('192.168.1.1', fakeLogger(), 500);
    socket.emit('error', new Error('EACCES'));

    expect(await promise).toEqual([]);
  });
});

describe('mdnsProbe', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    dgram.createSocket.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('scans raw response bytes for a known vendor string', async () => {
    const socket = fakeSocket();
    dgram.createSocket.mockReturnValue(socket);

    const promise = mdnsProbe('192.168.1.1', fakeLogger(), 400);
    socket.emit('message', Buffer.from('some-service._http._tcp.local GL.iNet-router', 'latin1'), { address: '192.168.1.1' });
    jest.advanceTimersByTime(400);

    expect(await promise).toEqual({ vendor: 'GL.iNet' });
  });

  it('resolves vendor:null when nothing recognizable comes back', async () => {
    const socket = fakeSocket();
    dgram.createSocket.mockReturnValue(socket);

    const promise = mdnsProbe('192.168.1.1', fakeLogger(), 400);
    jest.advanceTimersByTime(400);

    expect(await promise).toEqual({ vendor: null });
  });
});

describe('discoverRouter', () => {
  // Real (tiny) timeouts here rather than fake timers — discoverRouter chains
  // several independently-async steps (execFile, then dgram, then fetch,
  // then dgram again), and interleaving fake-timer advances with all of
  // that is fragile. config.routerSsdpTimeoutMs/routerMdnsTimeoutMs let
  // tests use real millisecond-scale windows instead.
  beforeEach(() => {
    execFile.mockReset();
    dgram.createSocket.mockReset();
  });
  afterEach(() => {
    delete global.fetch;
  });

  const fastConfig = { ipBin: 'ip', routerSsdpTimeoutMs: 20, routerMdnsTimeoutMs: 20 };

  it('returns the empty result when no default gateway can be found', async () => {
    execFile.mockImplementation((...args) => args[args.length - 1](new Error('no route')));
    const result = await discoverRouter(fastConfig, fakeLogger());
    expect(result.vendor).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('prioritizes an SSDP match over http-header/mdns/oui signals', async () => {
    mockExecFileStdout('default via 192.168.1.1 dev eth0\n192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n');
    const socket = fakeSocket();
    dgram.createSocket.mockReturnValue(socket);
    global.fetch = jest.fn().mockResolvedValue({ headers: new Map(), text: async () => '' });

    const promise = discoverRouter(fastConfig, fakeLogger());
    // Socket is bound synchronously (fakeSocket's bind invokes its callback
    // immediately), so listeners are attached before this fires.
    setImmediate(() => socket.emit('message', Buffer.from('SERVER: RouterOS\r\n'), { address: '192.168.1.1' }));

    const result = await promise;
    expect(result.vendor).toBe('MikroTik');
    expect(result.detectionMethod).toBe('SSDP');
    expect(result.confidence).toBe(90);
    expect(result.ipAddress).toBe('192.168.1.1');
  });

  it('falls back to OUI lookup when every active probe comes back empty', async () => {
    mockExecFileStdout('default via 192.168.1.1 dev eth0\n192.168.1.1 dev eth0 lladdr 4c:5e:0c:11:22:33 REACHABLE\n');
    const socket = fakeSocket();
    dgram.createSocket.mockReturnValue(socket);
    global.fetch = jest.fn().mockResolvedValue({ headers: new Map(), text: async () => '' });

    const result = await discoverRouter(fastConfig, fakeLogger());
    expect(result.vendor).toBe('MikroTik'); // 4c:5e:0c OUI
    expect(result.detectionMethod).toBe('OUI_LOOKUP');
    expect(result.confidence).toBe(40);
  });
});
