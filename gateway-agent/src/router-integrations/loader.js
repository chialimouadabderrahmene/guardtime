'use strict';

const { GuideOnlyPlugin } = require('./guide-only');
const { assertImplementsPluginInterface } = require('./plugin-interface');

/**
 * Router Integration Engine plugin loader — mirrors firewall-controller.js's
 * createFirewallController() pattern: pick an implementation by string key,
 * default to a safe fallback (GuideOnlyPlugin) for every pluginId this
 * gateway-agent hasn't shipped a real integration for yet.
 */
function loadPlugin(pluginId, logger) {
  switch (pluginId) {
    case 'fritzbox': {
      const { FritzBoxPlugin } = require('./fritzbox');
      assertImplementsPluginInterface(FritzBoxPlugin, 'fritzbox');
      return FritzBoxPlugin;
    }
    case 'mikrotik': {
      const { MikroTikPlugin } = require('./mikrotik');
      assertImplementsPluginInterface(MikroTikPlugin, 'mikrotik');
      return MikroTikPlugin;
    }
    case 'openwrt': {
      const { OpenWrtPlugin } = require('./openwrt');
      assertImplementsPluginInterface(OpenWrtPlugin, 'openwrt');
      return OpenWrtPlugin;
    }
    case 'unifi': {
      const { UniFiPlugin } = require('./unifi');
      assertImplementsPluginInterface(UniFiPlugin, 'unifi');
      return UniFiPlugin;
    }
    default:
      if (logger && pluginId) {
        logger.debug('router plugin loader: no implemented plugin for pluginId, using guide-only fallback', { pluginId });
      }
      return GuideOnlyPlugin;
  }
}

module.exports = { loadPlugin };
