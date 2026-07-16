# GuardTime Gateway Agent

Linux gateway-level enforcement agent for GuardTime. It runs on a router, Raspberry Pi, or Linux VM that is in the forwarding path for child devices.

## What It Does

- Polls the backend at `GET /gateway/policies`.
- Discovers LAN devices from `ip neigh` with `arp -a` fallback.
- Maps backend devices by MAC address and IP address.
- Applies hard internet blocks using an owned iptables chain:
  - `iptables -A FORWARD -s <device_ip> -j DROP`
  - `iptables -A FORWARD -m mac --mac-source <mac> -j DROP`
- Terminates active flows on hard-block transitions:
  - `conntrack -D -s <device_ip>`
  - `conntrack -D -d <device_ip>`
- Attempts TCP RST injection with Python + Scapy before the DROP rule takes over.
- Applies soft-pause throttling with `tc` when backend policy action is `THROTTLE`.
- Redirects DNS traffic to the controlled resolver:
  - UDP/53 and TCP/53 in `nat PREROUTING`

## Backend Requirements

1. Create and pair a gateway from the parent account.
2. Assign devices to that `gatewayId`.
3. Store each device MAC address when possible.
4. Run the backend with `CONTROLLED_DNS_IP` or set `DNS_REDIRECT_IP` locally in the agent.

## Install

```bash
cd gateway-agent
cp .env.example .env
nano .env
npm start
```

The process must run as root, or with enough capability to manage iptables.

## Configuration

```bash
BACKEND_URL=https://your-backend.example.com
GATEWAY_TOKEN=<token returned by /gateway/register>
POLL_INTERVAL_MS=3000
DNS_REDIRECT_IP=192.168.1.1
ENABLE_DNS_REDIRECT=true
DRY_RUN=false
ENABLE_CONNTRACK_KILL=true
ENABLE_TCP_RST=true
ENABLE_QOS=true
QOS_INTERFACES=br-lan
QOS_RATE=1kbit
```

Use `DRY_RUN=true` on development machines to verify command generation without changing firewall state.

## Example Manual Rules

Block by IP:

```bash
iptables -A FORWARD -s 192.168.1.50 -j DROP
```

Block by MAC:

```bash
iptables -A FORWARD -m mac --mac-source aa:bb:cc:dd:ee:ff -j DROP
```

Unblock matching IP rule:

```bash
iptables -D FORWARD -s 192.168.1.50 -j DROP
```

Redirect DNS to the controlled resolver:

```bash
iptables -t nat -A PREROUTING -p udp --dport 53 -j DNAT --to-destination 192.168.1.1:53
iptables -t nat -A PREROUTING -p tcp --dport 53 -j DNAT --to-destination 192.168.1.1:53
```

Kill active connection-tracking entries:

```bash
conntrack -D -s 192.168.1.50
conntrack -D -d 192.168.1.50
```

Throttle a device with `tc`:

```bash
tc qdisc replace dev br-lan root handle 1: htb default 30
tc class replace dev br-lan parent 1: classid 1:1 htb rate 1000mbit
tc class replace dev br-lan parent 1:1 classid 1:10 htb rate 1kbit ceil 1kbit
tc filter add dev br-lan protocol ip parent 1: prio 10 u32 match ip src 192.168.1.50 flowid 1:10
tc filter add dev br-lan protocol ip parent 1: prio 11 u32 match ip dst 192.168.1.50 flowid 1:10
```

## Data Flow

```text
Parent App
  -> POST /devices/:id/internet-lock
  -> Backend sets Device.internetLocked=true
  -> Gateway agent polls GET /gateway/policies
  -> Agent maps MAC/IP from ARP/neighbour table
  -> Agent deletes conntrack entries for the device
  -> Agent attempts TCP RST injection for observed TCP flows
  -> Agent rebuilds GuardTime iptables chain
  -> Device traffic is dropped in FORWARD immediately
```

## State Machine

```text
ALLOW
  - no DROP rules
  - no QoS filters
  - DNS redirect remains active

THROTTLE
  - no DROP rules
  - tc filters send src/dst device traffic into 1kbit HTB class
  - DNS redirect remains active

BLOCK
  - on transition: conntrack delete, then TCP RST injection
  - steady state: iptables FORWARD DROP by IP and MAC
  - DNS redirect remains active
```

## Production Notes

- Put the agent on the default gateway or a transparent bridge. If traffic does not traverse this host, iptables cannot enforce it.
- Prefer MAC assignment in the backend. IP-only enforcement is vulnerable to DHCP changes.
- Keep DNS filtering enabled. Gateway blocking is Level 2 hard control; DNS remains useful for category policy and logging.
- Persist firewall rules with your distro/router tooling if needed. The agent recreates its own chains on startup.
- TCP RST injection requires `python3`, Scapy, and packet-capture privileges. If unavailable, conntrack deletion plus iptables DROP still handles most immediate termination.
- `tc qdisc replace` owns the root qdisc on `QOS_INTERFACES`. Use a dedicated bridge/interface or integrate with an existing QoS hierarchy before enabling on production routers with custom shaping.
