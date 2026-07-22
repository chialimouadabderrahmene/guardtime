# GuardTime gateway-agent — OPTIONAL/EXPERIMENTAL container image.
#
# Real production enforcement needs direct root/CAP_NET_ADMIN access to the
# host's actual LAN (iptables/nftables/conntrack rewrite the HOST's
# netfilter state) — the fully-capable, recommended production path is the
# bare-metal systemd unit at gateway-agent/deploy/guardtime-gateway-agent.service,
# not this container. This image exists for parents who explicitly choose
# the Docker/Software-Gateway path anyway (see docker-compose.prod.yml's
# `gateway-agent` service, gated behind the `gateway-agent` profile and
# requiring --network host + cap_add): it runs everything non-root with
# only the two capabilities it actually needs (NET_ADMIN, NET_RAW) granted
# by the compose file, not baked into the image.
#
# Zero npm runtime dependencies (everything enforcement-related shells out
# to system binaries — see main.js's module doc comment), so the multi-stage
# split here is mostly about layering discipline, not slimming a large
# dependency tree.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache \
    iptables \
    ip6tables \
    nftables \
    conntrack-tools \
    iproute2 \
    openssh-client \
    sshpass \
    python3 \
    py3-pip \
    net-snmp-tools \
    arp-scan \
  && addgroup -S gwagent && adduser -S gwagent -G gwagent

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

RUN chown -R gwagent:gwagent /app
USER gwagent

ENV NODE_ENV=production
# Default heartbeat path (/var/run/...) needs root to create; point it
# somewhere this container's unprivileged user actually owns — same
# convention as Dockerfile.staging.
ENV HEARTBEAT_PATH=/app/.heartbeat.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node src/healthcheck.js

CMD ["node", "src/main.js"]
