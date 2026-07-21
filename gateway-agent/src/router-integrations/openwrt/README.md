# OpenWrt — `openwrt`

Protocol: **ubus JSON-RPC over HTTP** (session-based login). Official docs: https://github.com/openwrt/rpcd

## Supported models

Any device running stock OpenWrt (or a close derivative — see `glinet/` for GL.iNet's own row) with `rpcd`/`uhttpd`'s `/ubus` endpoint enabled — the default on any OpenWrt install with LuCI.

## Requirements

- `credentials.username` (defaults to `root`) / `credentials.password`.
- The `uci`, `session`, and `luci` ubus objects available (standard on any OpenWrt install with LuCI).

## Limitations

- `disconnectClient` iterates every `hostapd.*` ubus object it can find and calls `del_client` on each — if the device model doesn't expose a `hostapd.*` object for its radio (uncommon), this reports failure honestly rather than a fake success.
- Config changes go through `uci set` + `uci commit`, then a best-effort `luci.setInitAction` reload — if `luci-mod-rpc` isn't installed the reload is skipped (the config still applies on next reboot/manual reload).

## Example

```js
const ctx = {
  ipAddress: '192.168.1.1',
  credentials: { username: 'root', password: '...' },
  logger: myLogger,
  dryRun: false,
};

await OpenWrtPlugin.applyFirewallRule(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF', deviceId: 'dev-123' });
await OpenWrtPlugin.logout(ctx); // real ubus session.destroy
```
