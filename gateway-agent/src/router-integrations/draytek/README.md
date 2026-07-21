# DrayTek (Vigor) — `draytek`

Protocol: **SNMP (reads) + SSH CLI (writes)**. Official docs: https://www.draytek.com/support/knowledge-base/5517

## Supported models

Vigor-series routers (DrayOS) with SNMP enabled for monitoring and SSH/Telnet CLI access for configuration — both officially documented in Vigor manuals.

## Requirements

- `credentials.snmpCommunity` (defaults to `public`) for reads via the system `snmpget` binary.
- `credentials.username`/`credentials.password` (or `credentials.privateKeyPath`) for SSH CLI writes.
- `snmpget` and `ssh`/`sshpass` installed on the gateway-agent host.

## Limitations

- No REST/JSON API exists for this vendor — the exact Vigor CLI command syntax used for writes (DNS, filter rules) follows the general shape DrayTek's manuals describe but has never been run against real firmware. Every mutating method verifies its change by reading the config back afterward specifically because of this.
- `disconnectClient` is unsupported: most Vigor models document no live wireless-station kick.

## Example

```js
const ctx = {
  ipAddress: '192.168.1.1',
  credentials: { username: 'admin', password: '...', snmpCommunity: 'public' },
  logger: myLogger,
  dryRun: false,
};

await DrayTekPlugin.applyFirewallRule(ctx, { ipAddress: '192.168.1.50', deviceId: 'dev-123' });
```
