# Ubiquiti UniFi — `unifi`

Protocol: **UniFi Network Application controller API** (session-cookie login, JSON over HTTPS). Official docs: https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API

## Supported models

Any UniFi Network Application: self-hosted controller software, or a UniFi OS console (UDM, UDM-Pro, Cloud Gateway). Both login/base-path shapes are handled automatically (`login()` tries the UniFi OS path first, falls back to legacy).

## Requirements

- `credentials.username` / `credentials.password` for a local controller admin.
- A trusted TLS certificate on the controller — this plugin never disables certificate verification (that would weaken every other HTTPS call this agent makes). Issue one from the controller's own "manage certificate" page (e.g. via Let's Encrypt) before pointing this plugin at it.
- `ctx.site` (defaults to `default`) if managing a non-default UniFi site.

## Limitations

- Not yet smoke-tested against real UniFi hardware (none available in this project's environment) — implemented against the widely-referenced controller API shape used by Home Assistant/python-unifi.

## Example

```js
const ctx = {
  ipAddress: '192.168.1.1',
  credentials: { username: 'guardtime', password: '...' },
  site: 'default',
  logger: myLogger,
  dryRun: false,
};

await UniFiPlugin.blockMAC(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' });
await UniFiPlugin.logout(ctx); // real POST /api/auth/logout or /api/logout
```
