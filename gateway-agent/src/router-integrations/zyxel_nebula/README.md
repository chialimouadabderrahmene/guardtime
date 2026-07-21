# Zyxel Nebula — `zyxel_nebula`

Protocol: **Nebula Open API** — Bearer API-key REST/JSON, cloud-hosted (not LAN-local). Official docs: https://zyxelnetworks.github.io/NebulaOpenAPI/

## Supported models

Nebula cloud-managed gateways/APs/switches ONLY. Standalone consumer Zyxel routers have no official API — see `zyxel_consumer` in the capability matrix (GUIDE_ONLY).

## Requirements

- `credentials.apiKey` — a Nebula Open API key.
- `ctx.orgId` — the Nebula organization ID.
- No `ipAddress`/LAN reachability needed — this is a cloud API (`ctx.apiBaseUrl` overrides the default `https://api.nebula.zyxel.com` host if needed).

## Limitations — read this before assuming it can enforce anything

The Nebula Open API's publicly documented scope (as of the cited docs) is organization/site/device/client **monitoring** — it does not publish a client-block, DNS-change, or firewall-rule write endpoint the way Omada's Open API documents block/unblock/reconnect. Every mutating method (`changeDNS`, `pauseDevice`, `resumeDevice`, `applyFirewallRule`, `removeFirewallRule`, `blockMAC`, `unblockMAC`, `disconnectClient`) honestly returns `success: false, guideOnly: true` explaining this, rather than inventing an endpoint Zyxel hasn't published. `detect`/`login`/`testConnection`/`health` are real, working calls against the documented read API.

## Example

```js
const ctx = {
  orgId: 'org-123',
  credentials: { apiKey: '...' },
  logger: myLogger,
  dryRun: false,
};

const status = await ZyxelNebulaPlugin.testConnection(ctx); // real
const result = await ZyxelNebulaPlugin.blockMAC(ctx, { macAddress: 'AA:BB:CC:DD:EE:FF' }); // honestly unsupported
```
