# Keenetic — `keenetic`

Protocol: **RCI** ("Remote Control Interface") HTTP API — Digest auth, GET/POST JSON, resource paths mirror the CLI command tree 1:1. Documented in Keenetic's own command-reference manuals (HTTP API / REST Core Interface section) — a vendor-published manual, which is why this is `OFFICIAL_API` rather than `GUIDE_ONLY`.

## Supported models

Any Keenetic device running a KeeneticOS build with the RCI HTTP interface enabled (the default on current firmware).

## Requirements

- `credentials.username` / `credentials.password` for Digest auth against `/rci`.

## Limitations

- The RCI transport itself (`/rci/<command-tree-path>`, Digest-authed GET/POST) is directly documented and on solid ground. The exact resource paths used for DNS (`/rci/ip/name-server`) and per-device access control (`/rci/ip/hotspot/host/<mac>`) follow Keenetic's well-known CLI vocabulary but have never been run against real firmware — every mutating method verifies its change by reading the resource back and restores the previous value on a verification failure.
- No IP-based firewall ACL — enforcement is MAC-keyed via the hotspot host `access: deny/permit` policy. `applyFirewallRule`/`removeFirewallRule` require a `macAddress`.
- `disconnectClient` is unsupported: no documented RCI action forces an already-associated Wi-Fi client off instantly.

## Example

```js
const ctx = {
  ipAddress: '192.168.1.1',
  credentials: { username: 'admin', password: '...' },
  logger: myLogger,
  dryRun: false,
};

await KeeneticPlugin.blockMAC(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' });
```
