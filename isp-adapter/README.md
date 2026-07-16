# GuardTime ISP Adapter

Level 4 ISP-grade integration layer. This service is intentionally separate from the home `gateway-agent`: it models provider-side enforcement where the control key is `tenantId + subscriberId`, not a household LAN IP or a shared public CGNAT address.

## Architecture

```text
Parent App / Backend
  |
  | POST /isp/policy/apply
  v
ISP Adapter
  |
  +-- tenant isolation: tenant_id
  +-- RADIUS session table: subscriber_id -> assigned private IP, public CGNAT IP, port range, BNG
  +-- DHCP lease table: MAC -> private IP -> subscriber_id
  +-- subscriber resolver: subscriber -> active session + devices[]
  v
BNG Controller
  |
  +-- BLOCK: blackhole subscriber assigned IP / apply CoA filter
  +-- THROTTLE: assign QoS profile
  +-- ALLOW: remove blackhole / clear QoS profile
  v
ISP Network
  |
  +-- BNG/BRAS
  +-- CGNAT
  +-- ISP DNS policy cache
```

## Why This Is ISP-Grade

Home gateway enforcement identifies a device by LAN IP/MAC and applies local iptables. That works inside one home but breaks at ISP scale.

This adapter enforces by subscriber:

- `tenantId` isolates each ISP.
- `subscriberId` survives CGNAT and public-IP sharing.
- RADIUS maps subscriber sessions to assigned access IPs.
- DHCP maps devices to the subscriber, but device identity is secondary.
- BNG state is the enforcement surface: blackhole, QoS, DNS policy.

## Run

```bash
cd isp-adapter
cp .env.example .env
npm start
```

All protected endpoints require:

```http
x-isp-adapter-token: <ADAPTER_TOKEN>
x-tenant-id: demo-isp
```

## Simulate RADIUS

```bash
curl -X POST http://localhost:4100/isp/radius/session \
  -H "content-type: application/json" \
  -H "x-isp-adapter-token: change-me-isp-adapter-token" \
  -H "x-tenant-id: algerie-telecom" \
  -d '{
    "subscriberId": "AT-000123",
    "assignedIp": "10.64.12.34",
    "publicIp": "197.112.10.8",
    "cgnatPortStart": 32000,
    "cgnatPortEnd": 32999,
    "bngId": "bng-algiers-01",
    "accessCircuitId": "OLT1/1/3/22"
  }'
```

## Simulate DHCP

```bash
curl -X POST http://localhost:4100/isp/dhcp/lease \
  -H "content-type: application/json" \
  -H "x-isp-adapter-token: change-me-isp-adapter-token" \
  -H "x-tenant-id: algerie-telecom" \
  -d '{
    "subscriberId": "AT-000123",
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "ipAddress": "192.168.1.50",
    "hostname": "ps5-bedroom"
  }'
```

## Push Policy

```bash
curl -X POST http://localhost:4100/isp/policy/apply \
  -H "content-type: application/json" \
  -H "x-isp-adapter-token: change-me-isp-adapter-token" \
  -H "x-tenant-id: algerie-telecom" \
  -d '{
    "subscriberId": "AT-000123",
    "action": "BLOCK",
    "reason": "PARENT_PAUSE"
  }'
```

Actions:

- `BLOCK`: simulate BNG blackhole + RADIUS CoA block profile + DNS policy block.
- `THROTTLE`: simulate BNG QoS profile assignment.
- `ALLOW`: remove blackhole, clear QoS, restore DNS allow policy.

## CGNAT Awareness

Many subscribers may share `publicIp`. The adapter never enforces by public IP alone. It records CGNAT metadata for observability:

```text
subscriber_id -> RADIUS assigned IP -> CGNAT public IP + port range
```

The enforcement target remains the subscriber's access-side assigned IP or BNG subscriber session.

## Data Flow

```text
1. Parent presses Pause Internet.
2. Backend resolves child/device to subscriberId.
3. Backend pushes POST /isp/policy/apply.
4. ISP adapter resolves:
   tenantId + subscriberId
   -> RADIUS active session
   -> assigned access IP
   -> DHCP devices[]
   -> BNG ID
5. BNG controller applies:
   BLOCK -> blackhole / CoA filter
   THROTTLE -> QoS profile
   ALLOW -> clear policy
6. DNS policy cache is updated at subscriber scope.
7. Subscriber loses connectivity even behind CGNAT.
```
