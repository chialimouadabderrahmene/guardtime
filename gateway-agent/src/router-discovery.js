'use strict';

// Router Integration Engine — automatic router detection. Combines several
// officially-standard, best-effort signals (none reverse-engineers a login
// page): SSDP (UPnP device discovery, RFC/UPnP-standard M-SEARCH), an HTTP
// header/body probe of the router's own admin root page, a lightweight
// mDNS byte-scan, and MAC OUI lookup (see oui-vendors.js) — combined into a
// single best-guess {vendor, model, firmwareVersion, detectionMethod,
// confidence} result, most-confident signal wins. An unrecognized/silent
// router yields vendor:null rather than a guess.
//
// DHCP Vendor Class (Option 60) is deliberately NOT used as a router-
// identification signal here: Option 60 is sent by a DHCP CLIENT to
// identify itself to a server, so it would only reveal something about the
// router if this agent could see the router acting as a DHCP client toward
// its ISP — i.e. sniffing the WAN link, not the LAN this agent runs on.
// From this agent's actual vantage point (behind the router, on the LAN it
// serves), the only DHCP traffic visible is the router's own DHCP SERVER
// handing out LAN leases, which is genuinely useful for identifying LAN
// CLIENT devices (see dhcp-leases.js, used by the client-fingerprinting
// pipeline) but says nothing about the router's own vendor. Claiming
// "DHCP Vendor Class" as a router-detection signal without that access
// would be exactly the kind of invented-capability this project's plugins
// are held to avoid.

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const dgram = require('node:dgram');
const execFileAsync = promisify(execFile);
const { lookupVendor } = require('./oui-vendors');

const SSDP_MULTICAST_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SSDP_MSEARCH =
  'M-SEARCH * HTTP/1.1\r\n' +
  `HOST: ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}\r\n` +
  'MAN: "ssdp:discover"\r\n' +
  'MX: 2\r\n' +
  'ST: ssdp:all\r\n\r\n';

async function getDefaultGatewayIp(config, logger) {
  try {
    const { stdout } = await execFileAsync(config.ipBin, ['route', 'show', 'default'], { timeout: 3000 });
    return stdout.match(/default via (\d{1,3}(?:\.\d{1,3}){3})/)?.[1] || null;
  } catch (err) {
    logger.debug('router-discovery: default gateway lookup failed', { error: err.message });
    return null;
  }
}

async function getGatewayMac(gatewayIp, config, logger) {
  try {
    const { stdout } = await execFileAsync(config.ipBin, ['neigh', 'show', gatewayIp], { timeout: 3000 });
    return stdout.match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i)?.[1]?.toLowerCase() || null;
  } catch (err) {
    logger.debug('router-discovery: gateway MAC lookup failed', { gatewayIp, error: err.message });
    return null;
  }
}

function parseSsdpResponse(raw) {
  const headers = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

/** Best-effort UPnP SSDP M-SEARCH — collects SERVER/LOCATION headers from whatever answers within the window. */
function ssdpDiscover(gatewayIp, logger, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const responses = [];
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve(responses);
    };

    socket.on('error', (err) => {
      logger.debug('router-discovery: ssdp socket error', { error: err.message });
      finish();
    });

    socket.on('message', (msg, rinfo) => {
      if (gatewayIp && rinfo.address !== gatewayIp) return;
      responses.push(parseSsdpResponse(msg.toString('utf8')));
    });

    socket.bind(() => {
      try {
        socket.send(SSDP_MSEARCH, SSDP_PORT, SSDP_MULTICAST_ADDR);
      } catch (err) {
        logger.debug('router-discovery: ssdp send failed', { error: err.message });
      }
    });

    setTimeout(finish, timeoutMs);
  });
}

function identifyVendorFromText(text) {
  if (!text) return null;
  if (/AVM|FRITZ!?Box/i.test(text)) return 'AVM';
  if (/MikroTik|RouterOS/i.test(text)) return 'MikroTik';
  if (/OpenWrt|LuCI/i.test(text)) return 'OpenWrt';
  if (/UniFi|Ubiquiti/i.test(text)) return 'Ubiquiti';
  if (/GL\.iNet/i.test(text)) return 'GL.iNet';
  if (/DrayTek|Vigor\d/i.test(text)) return 'DrayTek';
  if (/Keenetic/i.test(text)) return 'Keenetic';
  if (/Linksys/i.test(text)) return 'Linksys';
  if (/\bOmada\b/i.test(text)) return 'TP-Link';
  if (/TP-Link|Deco|Archer(?:\s|$)/i.test(text)) return 'TP-Link';
  if (/ASUS|ASUSWRT/i.test(text)) return 'ASUS';
  if (/NETGEAR/i.test(text)) return 'Netgear';
  if (/D-Link/i.test(text)) return 'D-Link';
  if (/Belkin/i.test(text)) return 'Belkin';
  if (/Synology/i.test(text)) return 'Synology';
  if (/Nebula|Zyxel/i.test(text)) return 'Zyxel';
  if (/Cisco/i.test(text)) return 'Cisco';
  if (/Buffalo|AirStation/i.test(text)) return 'Buffalo';
  if (/Mercusys/i.test(text)) return 'Mercusys';
  if (/\bTenda\b/i.test(text)) return 'Tenda';
  if (/Xiaomi|MiWifi|Redmi/i.test(text)) return 'Xiaomi';
  if (/Huawei/i.test(text)) return 'Huawei';
  if (/TOTOLINK/i.test(text)) return 'TOTOLINK';
  if (/Sercomm/i.test(text)) return 'Sercomm';
  if (/Actiontec/i.test(text)) return 'Actiontec';
  if (/Hitron/i.test(text)) return 'Hitron';
  if (/Comtrend/i.test(text)) return 'Comtrend';
  if (/\bNokia\b/i.test(text)) return 'Nokia';
  if (/Sagemcom/i.test(text)) return 'Sagemcom';
  if (/Technicolor/i.test(text)) return 'Technicolor';
  if (/Arris/i.test(text)) return 'Arris';
  if (/Arcadyan/i.test(text)) return 'Arcadyan';
  return null;
}

async function httpHeaderProbe(gatewayIp, logger, timeoutMs = 2000) {
  try {
    const response = await fetch(`http://${gatewayIp}/`, { signal: AbortSignal.timeout(timeoutMs) });
    const server = response.headers.get('server') || '';
    const wwwAuth = response.headers.get('www-authenticate') || '';
    const bodyText = (await response.text()).slice(0, 4000);
    const vendor = identifyVendorFromText(server) || identifyVendorFromText(wwwAuth) || identifyVendorFromText(bodyText);
    return { vendor, detail: /<title>([^<]+)<\/title>/i.exec(bodyText)?.[1] || null };
  } catch (err) {
    logger.debug('router-discovery: http header probe failed', { gatewayIp, error: err.message });
    return { vendor: null, detail: null };
  }
}

/** A minimal DNS query packet: one PTR question for "_http._tcp.local". */
function buildMdnsQuery() {
  const name = '_http._tcp.local';
  const labels = name.split('.');
  const nameBuf = Buffer.concat([
    ...labels.map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label, 'ascii')])),
    Buffer.from([0]),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4); // QDCOUNT = 1
  const question = Buffer.concat([nameBuf, Buffer.from([0x00, 0x0c]), Buffer.from([0x00, 0x01])]); // TYPE=PTR CLASS=IN
  return Buffer.concat([header, question]);
}

/**
 * Best-effort mDNS probe: sends one generic PTR query and scans raw
 * response bytes for known vendor identifier strings. This is NOT a full
 * RFC 6762 parser (no name-compression walking, no per-record-type
 * dispatch) — many mDNS responders embed plaintext vendor/model strings in
 * their service instance names, which is signal enough for a fingerprint
 * heuristic without a complete resolver implementation.
 */
function mdnsProbe(gatewayIp, logger, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const responses = [];
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      const vendor = responses.map((raw) => identifyVendorFromText(raw)).find(Boolean) || null;
      resolve({ vendor });
    };

    socket.on('error', (err) => {
      logger.debug('router-discovery: mdns socket error', { error: err.message });
      finish();
    });

    socket.on('message', (msg, rinfo) => {
      if (gatewayIp && rinfo.address !== gatewayIp) return;
      responses.push(msg.toString('latin1'));
    });

    socket.bind(() => {
      try {
        socket.addMembership('224.0.0.251');
        socket.send(buildMdnsQuery(), 5353, '224.0.0.251');
      } catch (err) {
        logger.debug('router-discovery: mdns send failed', { error: err.message });
      }
    });

    setTimeout(finish, timeoutMs);
  });
}

const EMPTY_RESULT = Object.freeze({
  vendor: null,
  model: null,
  firmwareVersion: null,
  detectionMethod: null,
  confidence: 0,
  ipAddress: null,
  hostname: null,
  macOui: null,
});

/** Runs every signal in priority order (most-to-least confident) and returns the first positive match. */
async function discoverRouter(config, logger) {
  const gatewayIp = await getDefaultGatewayIp(config, logger);
  if (!gatewayIp) return { ...EMPTY_RESULT };

  const macAddress = await getGatewayMac(gatewayIp, config, logger);
  const macOui = macAddress ? lookupVendor(macAddress) : null;

  const ssdpResponses = await ssdpDiscover(gatewayIp, logger, config.routerSsdpTimeoutMs);
  const ssdpVendor = ssdpResponses.map((headers) => identifyVendorFromText(headers.server)).find(Boolean);
  if (ssdpVendor) {
    return { ...EMPTY_RESULT, vendor: ssdpVendor, detectionMethod: 'SSDP', confidence: 90, ipAddress: gatewayIp, macOui };
  }

  const httpResult = await httpHeaderProbe(gatewayIp, logger);
  if (httpResult.vendor) {
    return {
      ...EMPTY_RESULT,
      vendor: httpResult.vendor,
      model: httpResult.detail,
      detectionMethod: 'HTTP_HEADER',
      confidence: 70,
      ipAddress: gatewayIp,
      macOui,
    };
  }

  const mdnsResult = await mdnsProbe(gatewayIp, logger, config.routerMdnsTimeoutMs);
  if (mdnsResult.vendor) {
    return { ...EMPTY_RESULT, vendor: mdnsResult.vendor, detectionMethod: 'MDNS', confidence: 60, ipAddress: gatewayIp, macOui };
  }

  if (macOui) {
    return { ...EMPTY_RESULT, vendor: macOui, detectionMethod: 'OUI_LOOKUP', confidence: 40, ipAddress: gatewayIp, macOui };
  }

  return { ...EMPTY_RESULT, ipAddress: gatewayIp, macOui: null };
}

module.exports = {
  discoverRouter,
  getDefaultGatewayIp,
  getGatewayMac,
  parseSsdpResponse,
  ssdpDiscover,
  httpHeaderProbe,
  mdnsProbe,
  identifyVendorFromText,
  buildMdnsQuery,
};
