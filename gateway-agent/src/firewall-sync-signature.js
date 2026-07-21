'use strict';

/**
 * Both firewall backends (iptables/nftables) rebuild their entire rule set
 * from scratch every sync cycle (flush + re-add), even when nothing in the
 * policy actually changed since the previous cycle — real, measurable
 * overhead (a snapshot/save call plus one or more exec calls per target)
 * repeated every few seconds indefinitely. This computes a deterministic
 * signature of everything that actually affects the generated rules, so a
 * controller can skip the whole rebuild when the signature is unchanged
 * from last cycle — same "remember previous state, diff, skip if
 * unchanged" shape as connection-killer.js's block-transition detection,
 * applied to the full policy instead of one device's action.
 *
 * Deliberately excludes anything NOT read by either controller's rule-
 * generation code (e.g. a target's hostname) so an unrelated field changing
 * elsewhere in the policy payload doesn't force a needless rebuild.
 */
function buildFirewallSyncSignature({
  targets,
  dnsRedirectIp,
  dnsRedirectIpv6,
  enableDnsRedirect,
  enableQuicBlockGlobal,
  enableDohBlock,
  enableIpv6,
}) {
  const normalizedTargets = (targets || [])
    .map((target) => ({
      deviceId: target.deviceId ?? null,
      action: target.action ?? null,
      ipAddress: target.ipAddress || null,
      ipv6Address: target.ipv6Address || null,
      macAddress: target.macAddress || null,
      vpnBlock: Boolean(target.vpnBlock),
      quicBlock: Boolean(target.quicBlock),
    }))
    .sort((a, b) => (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0));

  return JSON.stringify({
    targets: normalizedTargets,
    dnsRedirectIp: dnsRedirectIp || null,
    dnsRedirectIpv6: dnsRedirectIpv6 || null,
    enableDnsRedirect: Boolean(enableDnsRedirect),
    enableQuicBlockGlobal: Boolean(enableQuicBlockGlobal),
    enableDohBlock: Boolean(enableDohBlock),
    enableIpv6: Boolean(enableIpv6),
  });
}

module.exports = { buildFirewallSyncSignature };
