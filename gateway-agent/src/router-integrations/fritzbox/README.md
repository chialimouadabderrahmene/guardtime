# FRITZ!Box (AVM) — `fritzbox`

Protocol: **TR-064** (SOAP over HTTP, HTTP Digest auth). Official docs: https://fritz.com/en/pages/interfaces

## Supported models

Any FRITZ!Box with TR-064 enabled (Home Network → Network → Network Settings → "Access for applications" in the FRITZ!OS UI). This covers essentially the full current FRITZ!Box lineup (7xxx/6xxx/5xxx series).

## Requirements

- TR-064 enabled on the box (on by default on most firmware).
- `credentials.username` / `credentials.password` — a FRITZ!Box user with "FRITZ!Box Settings" permission.
- Port 49000 (the fixed TR-064 port) reachable from the gateway-agent host.

## Limitations

- `disconnectClient` is unsupported: TR-064's `X_AVM-DE_HostFilter` service only allows/disallows WAN access, it does not force a live Wi-Fi association off.
- No QoS control is exposed via TR-064.
- Control URLs are discovered fresh from `/tr64desc.xml` on every call rather than hardcoded, since AVM does not publish them as a fixed contract.

## Example

```js
const ctx = {
  ipAddress: '192.168.178.1',
  credentials: { username: 'guardtime', password: '...' },
  logger: myLogger,
  dryRun: false,
};

await FritzBoxPlugin.changeDNS(ctx, { dnsServer: '1.1.1.1' });
await FritzBoxPlugin.applyFirewallRule(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' });
```
