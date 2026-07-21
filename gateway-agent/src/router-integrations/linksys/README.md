# Linksys (Smart Wi-Fi) — `linksys`

Protocol: **JNAP** (JSON Network API for Provisioning) — POST `/JNAP/` with an `X-JNAP-Action` header naming the action. Official docs: the Linksys Smart Wi-Fi Developer SDK PDF (linked from `router-capability.matrix.ts`'s `linksys` row).

## Supported models

Linksys Smart Wi-Fi routers/mesh (Velop, EA/MR series) with JNAP enabled — the default for any Smart Wi-Fi firmware.

## Requirements

- `credentials.username` (usually `admin`) / `credentials.password` — sent per-request via `X-JNAP-Authorization: Basic ...` (stateless, like HTTP Basic; no session to log out of).
- Production JNAP access requires registering as an approved developer in the Linksys Developer Community.

## Limitations

- No IP-based firewall ACL — Linksys's enforcement primitive is MAC-based (parental-control block list / MAC filter deny list). `applyFirewallRule`/`removeFirewallRule` require a `macAddress` and delegate to `blockMAC`/`unblockMAC`.
- `disconnectClient` is unsupported: no documented JNAP action forces an already-associated client off instantly.
- Not yet smoke-tested against real hardware — implemented against the documented JNAP transport (action-header + POST-to-one-endpoint), which is the independently corroborated part of the protocol.

## Example

```js
const ctx = {
  ipAddress: '192.168.1.1',
  credentials: { username: 'admin', password: '...' },
  logger: myLogger,
  dryRun: false,
};

await LinksysPlugin.pauseDevice(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF', deviceId: 'dev-123' });
```
