# TP-Link Omada — `tplink_omada`

Protocol: **Omada Open API (Northbound API)** — OAuth2 client-credentials, REST/JSON. Official docs: https://use1-omada-northbound.tplinkcloud.com/doc.html

## Supported models

Omada SDN Controller-managed access points/gateways/switches ONLY. TP-Link's consumer Deco and Archer lines have no official API — see `tplink_consumer` in the capability matrix (GUIDE_ONLY).

## Requirements

- `credentials.clientId` / `credentials.clientSecret` (Omada Open API app registration).
- `ctx.omadacId` — the Omada controller's own ID.
- `ctx.siteId` optional; if omitted, the first site returned by the controller is used.

## Limitations

- No documented WAN-DNS-change or IP-based firewall-rule endpoint in the Open API's published scope — `changeDNS`/`applyFirewallRule`(without a MAC) honestly report this rather than inventing an endpoint. Enforcement uses the documented per-client `block`/`unblock`/`reconnect` actions instead.
- Not yet smoke-tested against a real controller.

## Example

```js
const ctx = {
  ipAddress: 'omada-controller.example.com',
  omadacId: 'abc123',
  credentials: { clientId: '...', clientSecret: '...' },
  logger: myLogger,
  dryRun: false,
};

await TplinkOmadaPlugin.blockMAC(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' });
await TplinkOmadaPlugin.disconnectClient(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' }); // reconnect action
```
