# MikroTik — `mikrotik`

Protocol: **RouterOS REST API** (JSON over HTTP, HTTP Basic auth). Official docs: https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST+API

## Supported models

Any RouterOS v7+ device with the `www` (or `www-ssl`) service enabled — the entire current RouterBOARD/CHR lineup.

## Requirements

- RouterOS v7.1+ (REST API was added in v7).
- `credentials.username` / `credentials.password` with API access.
- Set `ctx.useHttps: true` once a certificate is configured to use `www-ssl` instead of plain `www` (recommended by MikroTik's own docs).

## Limitations

- No parental-control concept in RouterOS — enforcement is generic firewall/ACL rules, tagged with a `guardtime:` comment prefix for identification/cleanup.
- HTTP Basic auth is stateless per request — there is no session to log out of (`logout()` reports this honestly rather than pretending to tear one down).

## Example

```js
const ctx = {
  ipAddress: '192.168.88.1',
  credentials: { username: 'guardtime', password: '...' },
  logger: myLogger,
  dryRun: false,
};

await MikroTikPlugin.blockMAC(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' });
await MikroTikPlugin.disconnectClient(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' });
```
