# GL.iNet — `glinet`

Protocol: **ubus/rpcd** — same as `openwrt/`. Official docs: https://dev.gl-inet.com/router-4.x-api/

## Supported models

Any GL.iNet travel router / mesh unit / VPN gateway — their firmware is OpenWrt-based with ubus/rpcd enabled by default, so this is a deliberate re-export of `OpenWrtPlugin`, not a separate implementation (see the module doc comment in `index.js` for why).

## Requirements

Identical to `openwrt/` — `credentials.username`/`credentials.password` for ubus session login.

## Limitations

Same as `openwrt/`. If GL.iNet's own custom "GL GUI" ever needs a GL.iNet-specific ubus object not covered by the generic `uci`/`luci` objects OpenWrtPlugin already uses, that would become real GL.iNet-specific code at that point.

## Example

Identical usage to `openwrt/` — see that README.
