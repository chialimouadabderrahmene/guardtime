'use strict';

/**
 * MAC OUI (first 3 octets) -> vendor name. Layer 4 fingerprint component.
 * Deliberately small and best-effort — like the project's other pattern
 * lists (VPN domains, strict-mode DoH resolvers), this is NOT an exhaustive
 * IEEE OUI database, just enough common consumer-device vendors to make the
 * fingerprint more distinguishing. An unrecognized prefix returns null and
 * fingerprinting still works fine without a vendor name.
 */
const OUI_VENDORS = new Map([
  ['3c:06:30', 'Apple'],
  ['a4:83:e7', 'Apple'],
  ['f0:18:98', 'Apple'],
  ['ac:de:48', 'Apple'],
  ['00:1e:c2', 'Apple'],
  ['8c:79:f5', 'Samsung'],
  ['5c:0a:5b', 'Samsung'],
  ['34:23:87', 'Samsung'],
  ['54:60:09', 'Google'],
  ['f4:f5:d8', 'Google'],
  ['44:65:0d', 'Amazon'],
  ['fc:65:de', 'Amazon'],
  ['b8:27:eb', 'Raspberry Pi Foundation'],
  ['dc:a6:32', 'Raspberry Pi Foundation'],
  ['e4:5f:01', 'Raspberry Pi Foundation'],
  ['24:6f:28', 'Espressif'],
  ['30:ae:a4', 'Espressif'],
  ['3c:71:bf', 'Espressif'],
  ['00:15:5d', 'Microsoft'],
  ['7c:1e:52', 'Microsoft'],
  ['00:1b:21', 'Intel'],
  ['3c:a9:f4', 'Intel'],
  ['34:ce:00', 'Xiaomi'],
  ['64:09:80', 'Xiaomi'],
  ['5c:aa:fd', 'Sonos'],
  ['50:c7:bf', 'TP-Link'],
  ['ec:08:6b', 'TP-Link'],
  ['00:09:bf', 'Nintendo'],
  ['98:b6:e9', 'Nintendo'],
  ['00:04:1f', 'Sony'],
  ['ac:9b:0a', 'Sony'],

  // Router Integration Engine — router-vendor OUIs (Layer 8 detection).
  ['00:04:0e', 'AVM'],
  ['34:31:c4', 'AVM'],
  ['9c:c7:a6', 'AVM'],
  ['4c:5e:0c', 'MikroTik'],
  ['6c:3b:6b', 'MikroTik'],
  ['48:8f:5a', 'MikroTik'],
  ['24:a4:3c', 'Ubiquiti'],
  ['04:18:d6', 'Ubiquiti'],
  ['80:2a:a8', 'Ubiquiti'],
  ['94:83:c4', 'GL.iNet'],
  ['20:e5:2a', 'Netgear'],
  ['a0:40:a0', 'Netgear'],
  ['1c:87:2c', 'ASUS'],
  ['04:d4:c4', 'ASUS'],
  ['48:f8:b3', 'Linksys'],
  ['c0:56:27', 'Linksys'],
  ['14:d6:4d', 'D-Link'],
  ['90:94:e4', 'D-Link'],
]);

function lookupVendor(macAddress) {
  if (!macAddress) return null;
  const prefix = macAddress.toLowerCase().split(':').slice(0, 3).join(':');
  return OUI_VENDORS.get(prefix) || null;
}

module.exports = { lookupVendor, OUI_VENDORS };
