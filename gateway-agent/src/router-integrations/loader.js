'use strict';

const { GuideOnlyPlugin } = require('./guide-only');
const { assertImplementsPluginInterface, withPluginDefaults } = require('./plugin-interface');

/**
 * Router Integration Engine plugin loader — mirrors firewall-controller.js's
 * createFirewallController() pattern: pick an implementation by string key,
 * default to a safe fallback (GuideOnlyPlugin) for every pluginId this
 * gateway-agent hasn't shipped a real integration for yet.
 *
 * Every plugin returned here is passed through withPluginDefaults() so
 * callers can always call .logout()/.health() regardless of whether the
 * individual plugin module implements them.
 */
function loadPlugin(pluginId, logger) {
  switch (pluginId) {
    case 'fritzbox': {
      const { FritzBoxPlugin } = require('./fritzbox');
      assertImplementsPluginInterface(FritzBoxPlugin, 'fritzbox');
      return withPluginDefaults(FritzBoxPlugin);
    }
    case 'mikrotik': {
      const { MikroTikPlugin } = require('./mikrotik');
      assertImplementsPluginInterface(MikroTikPlugin, 'mikrotik');
      return withPluginDefaults(MikroTikPlugin);
    }
    case 'openwrt': {
      const { OpenWrtPlugin } = require('./openwrt');
      assertImplementsPluginInterface(OpenWrtPlugin, 'openwrt');
      return withPluginDefaults(OpenWrtPlugin);
    }
    case 'unifi': {
      const { UniFiPlugin } = require('./unifi');
      assertImplementsPluginInterface(UniFiPlugin, 'unifi');
      return withPluginDefaults(UniFiPlugin);
    }
    case 'edgerouter': {
      const { EdgeRouterPlugin } = require('./edgerouter');
      assertImplementsPluginInterface(EdgeRouterPlugin, 'edgerouter');
      return withPluginDefaults(EdgeRouterPlugin);
    }
    case 'glinet': {
      const { GLiNetPlugin } = require('./glinet');
      assertImplementsPluginInterface(GLiNetPlugin, 'glinet');
      return withPluginDefaults(GLiNetPlugin);
    }
    case 'linksys': {
      const { LinksysPlugin } = require('./linksys');
      assertImplementsPluginInterface(LinksysPlugin, 'linksys');
      return withPluginDefaults(LinksysPlugin);
    }
    case 'draytek': {
      const { DrayTekPlugin } = require('./draytek');
      assertImplementsPluginInterface(DrayTekPlugin, 'draytek');
      return withPluginDefaults(DrayTekPlugin);
    }
    case 'tplink_omada': {
      const { TplinkOmadaPlugin } = require('./tplink_omada');
      assertImplementsPluginInterface(TplinkOmadaPlugin, 'tplink_omada');
      return withPluginDefaults(TplinkOmadaPlugin);
    }
    case 'zyxel_nebula': {
      const { ZyxelNebulaPlugin } = require('./zyxel_nebula');
      assertImplementsPluginInterface(ZyxelNebulaPlugin, 'zyxel_nebula');
      return withPluginDefaults(ZyxelNebulaPlugin);
    }
    case 'keenetic': {
      const { KeeneticPlugin } = require('./keenetic');
      assertImplementsPluginInterface(KeeneticPlugin, 'keenetic');
      return withPluginDefaults(KeeneticPlugin);
    }
    default:
      if (logger && pluginId) {
        logger.debug('router plugin loader: no implemented plugin for pluginId, using guide-only fallback', { pluginId });
      }
      return withPluginDefaults(GuideOnlyPlugin);
  }
}

module.exports = { loadPlugin };
