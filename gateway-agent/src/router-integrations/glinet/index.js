'use strict';

const { OpenWrtPlugin } = require('../openwrt');

/**
 * GL.iNet routers ship OpenWrt-based firmware with ubus/rpcd enabled by
 * default (this is GL.iNet's own documented architecture — their firmware
 * is a customized OpenWrt build, not a separate OS) — the exact same
 * `session.login` + `uci` ubus mechanism openwrt/index.js already
 * implements works unmodified against stock GL.iNet firmware.
 *
 * This is a deliberate re-export, not a placeholder: GL.iNet gets its own
 * capability-matrix row and pluginId (parents configuring a GL.iNet travel
 * router shouldn't have to know it's "really" OpenWrt underneath), but
 * there is no GL.iNet-specific protocol to implement — building a second,
 * near-identical ubus client here would be exactly the "duplicate
 * abstraction" this project's own conventions warn against.
 *
 * If GL.iNet's own web UI (the parts beyond stock LuCI — their custom
 * "GL GUI") ever needs a GL.iNet-specific ubus object not covered by the
 * generic `uci`/`luci` objects OpenWrtPlugin already uses, that would
 * become real GL.iNet-specific code at that point, not before.
 */
const GLiNetPlugin = OpenWrtPlugin;

module.exports = { GLiNetPlugin };
