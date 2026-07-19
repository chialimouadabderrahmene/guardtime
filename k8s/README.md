# GuardTime Kubernetes manifests

Apply in order:

```
kubectl apply -f namespace.yaml
kubectl -n guardtime create secret generic backend-secrets --from-literal=...   # see backend.yaml header
kubectl apply -f backend.yaml
kubectl apply -f dns-service.yaml
kubectl apply -f web-client.yaml
kubectl apply -f ingress.yaml
```

## What's not here, and why

**gateway-agent is intentionally not containerized or included here.** It
manipulates the host's `iptables`/`nftables`, conntrack table, and QoS
(`tc`) directly on the router/gateway box it runs on — that requires
`NET_ADMIN` and direct access to the host network namespace either way, so
a Kubernetes Pod would need `hostNetwork: true` + `privileged: true`,
which throws away the isolation Kubernetes is for while adding an extra
layer of indirection over what a plain systemd service already does
correctly (see `gateway-agent/deploy/guardtime-gateway-agent.service`,
`Restart=always`). It stays a bare-metal daemon on each gateway device.

**isp-adapter is not deployed here either** — it's a standalone
simulation/prototype (`SIMULATION_MODE=true`), not wired into the live
product (see the platform architecture notes elsewhere in this repo).

## Prerequisites this assumes

- An ingress-nginx controller and cert-manager (`ClusterIssuer:
  letsencrypt-prod`) already installed — `ingress.yaml` doesn't install
  them.
- Container images built and pushed by CI to whatever registry you point
  `image:` at (the manifests use `guardtime/*:latest` placeholders —
  CI should push an immutable tag per release and these should be pinned,
  not `:latest`, once you wire up the deploy job).
- `backend-secrets` created out of band (see `backend.yaml`) — nothing
  here contains real credentials.
- A UDP-capable LoadBalancer for `dns-service` if you deploy it to a
  cloud cluster — see the note at the top of `dns-service.yaml` on why a
  static VPS may still be the better fit for this specific component.
