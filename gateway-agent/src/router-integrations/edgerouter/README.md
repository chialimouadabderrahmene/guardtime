# Ubiquiti EdgeRouter (EdgeOS) — `edgerouter`

Protocol: **SSH CLI** (Vyatta-derived `configure`/`set`/`commit`/`save`). Official docs: https://help.ui.com (EdgeOS management — the HTTP API is not officially published, so this is CLI-only by design)

## Supported models

Any EdgeOS device (EdgeRouter X/ER/ERPoe/ERLite series).

## Requirements

- `credentials.username` (defaults to `ubnt`) plus either `credentials.privateKeyPath` (preferred) or `credentials.password`.
- Password auth requires `sshpass` installed on the gateway-agent host (`ssh` itself has no non-interactive password flag).

## Limitations

- `disconnectClient` is unsupported: most EdgeRouter models are router-only hardware with no built-in wireless station table to kick a client from. Blocking (`blockMAC`/`applyFirewallRule`) is the real enforcement mechanism.
- Firewall rule indices are deterministically derived from the device/MAC key (range 5000-5899) so re-applying is idempotent and removal targets exactly the rule this plugin created.

## Example

```js
const ctx = {
  ipAddress: '192.168.1.1',
  credentials: { username: 'ubnt', privateKeyPath: '/keys/id_rsa' },
  logger: myLogger,
  dryRun: false,
};

await EdgeRouterPlugin.blockMAC(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF', deviceId: 'dev-123' });
```
