'use strict';

function ipToInt(ipAddress) {
  const parts = ipAddress.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts[0] * 2 ** 24 + parts[1] * 2 ** 16 + parts[2] * 2 ** 8 + parts[3];
}

/** IPv4-only CIDR membership test (Layer 5 "support IPv4"). */
function ipInCidr(ipAddress, cidr) {
  const [rangeIp, prefixStr] = cidr.split('/');
  const prefix = Number.parseInt(prefixStr, 10);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipToInt(ipAddress);
  const rangeInt = ipToInt(rangeIp);
  if (ipInt === null || rangeInt === null) return false;
  if (prefix === 0) return true;

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

module.exports = { ipToInt, ipInCidr };
