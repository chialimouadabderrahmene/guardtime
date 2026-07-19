'use strict';

const { REQUIRED_METHODS, assertImplementsPluginInterface } = require('../src/router-integrations/plugin-interface');
const { GuideOnlyPlugin } = require('../src/router-integrations/guide-only');

describe('plugin-interface contract', () => {
  it('lists all 11 required methods from the spec', () => {
    expect(REQUIRED_METHODS.sort()).toEqual(
      [
        'detect',
        'login',
        'testConnection',
        'changeDNS',
        'pauseDevice',
        'disconnectClient',
        'resumeDevice',
        'applyFirewallRule',
        'removeFirewallRule',
        'blockMAC',
        'unblockMAC',
      ].sort(),
    );
  });

  it('accepts a plugin implementing every required method', () => {
    expect(() => assertImplementsPluginInterface(GuideOnlyPlugin, 'guide-only')).not.toThrow();
  });

  it('throws naming every missing method', () => {
    const incomplete = { detect: async () => {}, login: async () => {} };
    expect(() => assertImplementsPluginInterface(incomplete, 'incomplete-plugin')).toThrow(
      /incomplete-plugin.*testConnection/s,
    );
  });
});

describe('GuideOnlyPlugin', () => {
  it('every mutating method returns success:false and guideOnly:true', async () => {
    const mutatingMethods = REQUIRED_METHODS.filter((m) => m !== 'detect');
    for (const method of mutatingMethods) {
      const result = await GuideOnlyPlugin[method]();
      expect(result.success).toBe(false);
      expect(result.guideOnly).toBe(true);
      expect(typeof result.message).toBe('string');
    }
  });

  it('detect() explains it defers to fingerprinting rather than pretending to detect anything', async () => {
    const result = await GuideOnlyPlugin.detect();
    expect(result.success).toBe(false);
  });
});
