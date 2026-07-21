'use strict';

const { loadPlugin } = require('../src/router-integrations/loader');
const { FritzBoxPlugin } = require('../src/router-integrations/fritzbox');
const { MikroTikPlugin } = require('../src/router-integrations/mikrotik');
const { OpenWrtPlugin } = require('../src/router-integrations/openwrt');
const { UniFiPlugin } = require('../src/router-integrations/unifi');
const { EdgeRouterPlugin } = require('../src/router-integrations/edgerouter');
const { GLiNetPlugin } = require('../src/router-integrations/glinet');
const { GuideOnlyPlugin } = require('../src/router-integrations/guide-only');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('loadPlugin', () => {
  // loadPlugin() wraps every result in withPluginDefaults() (so .logout()/
  // .health() are always callable), which returns a shallow-copied object —
  // so the loaded plugin is no longer reference-equal (`toBe`) to the raw
  // module export. Every one of its REQUIRED method properties still IS the
  // same function reference, which is what actually matters here.
  it('loads the real plugin for each implemented pluginId', () => {
    expect(loadPlugin('fritzbox').detect).toBe(FritzBoxPlugin.detect);
    expect(loadPlugin('mikrotik').detect).toBe(MikroTikPlugin.detect);
    expect(loadPlugin('openwrt').detect).toBe(OpenWrtPlugin.detect);
    expect(loadPlugin('unifi').detect).toBe(UniFiPlugin.detect);
    expect(loadPlugin('edgerouter').detect).toBe(EdgeRouterPlugin.detect);
    expect(loadPlugin('glinet').detect).toBe(GLiNetPlugin.detect);
  });

  it('GL.iNet is a re-export of the OpenWrt plugin, not a duplicate implementation', () => {
    expect(GLiNetPlugin).toBe(OpenWrtPlugin);
  });

  it('every loaded plugin exposes callable logout()/health() even when the module itself omits one', () => {
    for (const pluginId of ['fritzbox', 'mikrotik', 'openwrt', 'unifi', 'edgerouter', 'glinet', 'totally-unknown']) {
      const plugin = loadPlugin(pluginId);
      expect(typeof plugin.logout).toBe('function');
      expect(typeof plugin.health).toBe('function');
    }
  });

  it('loads real plugins for tplink_omada/zyxel_nebula now that they are implemented', () => {
    const { TplinkOmadaPlugin } = require('../src/router-integrations/tplink_omada');
    const { ZyxelNebulaPlugin } = require('../src/router-integrations/zyxel_nebula');
    expect(loadPlugin('tplink_omada').detect).toBe(TplinkOmadaPlugin.detect);
    expect(loadPlugin('zyxel_nebula').detect).toBe(ZyxelNebulaPlugin.detect);
  });

  it('falls back to GuideOnlyPlugin for a pure guide-only vendor', () => {
    expect(loadPlugin('netgear').detect).toBe(GuideOnlyPlugin.detect);
    expect(loadPlugin('asus').detect).toBe(GuideOnlyPlugin.detect);
  });

  it('falls back to GuideOnlyPlugin for a null/undefined/unrecognized pluginId (undetected router)', () => {
    expect(loadPlugin(null).detect).toBe(GuideOnlyPlugin.detect);
    expect(loadPlugin(undefined).detect).toBe(GuideOnlyPlugin.detect);
    expect(loadPlugin('totally-unknown').detect).toBe(GuideOnlyPlugin.detect);
  });

  it('logs a debug line when falling back for a known pluginId (not for null/undefined)', () => {
    const logger = fakeLogger();
    loadPlugin('netgear', logger);
    expect(logger.debug).toHaveBeenCalledWith(
      'router plugin loader: no implemented plugin for pluginId, using guide-only fallback',
      { pluginId: 'netgear' },
    );
  });
});
