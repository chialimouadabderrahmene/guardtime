'use strict';

const { loadPlugin } = require('../src/router-integrations/loader');
const { FritzBoxPlugin } = require('../src/router-integrations/fritzbox');
const { MikroTikPlugin } = require('../src/router-integrations/mikrotik');
const { OpenWrtPlugin } = require('../src/router-integrations/openwrt');
const { GuideOnlyPlugin } = require('../src/router-integrations/guide-only');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('loadPlugin', () => {
  it('loads the real plugin for each implemented pluginId', () => {
    expect(loadPlugin('fritzbox')).toBe(FritzBoxPlugin);
    expect(loadPlugin('mikrotik')).toBe(MikroTikPlugin);
    expect(loadPlugin('openwrt')).toBe(OpenWrtPlugin);
  });

  it('falls back to GuideOnlyPlugin for a documented-but-unimplemented vendor', () => {
    expect(loadPlugin('unifi')).toBe(GuideOnlyPlugin);
    expect(loadPlugin('edgerouter')).toBe(GuideOnlyPlugin);
    expect(loadPlugin('glinet')).toBe(GuideOnlyPlugin);
  });

  it('falls back to GuideOnlyPlugin for a pure guide-only vendor', () => {
    expect(loadPlugin('netgear')).toBe(GuideOnlyPlugin);
    expect(loadPlugin('asus')).toBe(GuideOnlyPlugin);
  });

  it('falls back to GuideOnlyPlugin for a null/undefined/unrecognized pluginId (undetected router)', () => {
    expect(loadPlugin(null)).toBe(GuideOnlyPlugin);
    expect(loadPlugin(undefined)).toBe(GuideOnlyPlugin);
    expect(loadPlugin('totally-unknown')).toBe(GuideOnlyPlugin);
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
