'use strict';

const {
  REQUIRED_METHODS,
  OPTIONAL_METHODS,
  assertImplementsPluginInterface,
  withPluginDefaults,
} = require('../src/router-integrations/plugin-interface');
const { GuideOnlyPlugin } = require('../src/router-integrations/guide-only');

function stubPlugin(overrides = {}) {
  const base = {};
  for (const method of REQUIRED_METHODS) base[method] = jest.fn(async () => ({ success: true, message: 'ok' }));
  return { ...base, ...overrides };
}

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

describe('OPTIONAL_METHODS (logout/health)', () => {
  it('are not part of REQUIRED_METHODS — the 6 pre-existing plugins keep working unmodified', () => {
    expect(OPTIONAL_METHODS).toEqual(['logout', 'health']);
    expect(REQUIRED_METHODS).not.toContain('logout');
    expect(REQUIRED_METHODS).not.toContain('health');
  });
});

describe('withPluginDefaults', () => {
  it('leaves a plugin with its own real logout/health untouched', () => {
    const realLogout = jest.fn(async () => ({ success: true, message: 'real logout' }));
    const realHealth = jest.fn(async () => ({ success: true, message: 'real health' }));
    const plugin = stubPlugin({ logout: realLogout, health: realHealth });

    const wrapped = withPluginDefaults(plugin);
    expect(wrapped.logout).toBe(realLogout);
    expect(wrapped.health).toBe(realHealth);
  });

  it('fills in a default logout() reporting no persistent session, without mutating the original module', async () => {
    const plugin = stubPlugin();
    const wrapped = withPluginDefaults(plugin);

    expect(plugin.logout).toBeUndefined();
    const result = await wrapped.logout();
    expect(result).toEqual({ success: true, message: expect.stringMatching(/no persistent session/) });
  });

  it('fills in a default health() built from testConnection(), with latency appended to detail', async () => {
    const plugin = stubPlugin({
      testConnection: jest.fn(async () => ({ success: true, message: 'connected', detail: 'v1.0' })),
    });
    const wrapped = withPluginDefaults(plugin);

    const result = await wrapped.health({});
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/^v1\.0 \(\d+ms\)$/);
  });

  it('default health() still reports failure when testConnection() fails', async () => {
    const plugin = stubPlugin({
      testConnection: jest.fn(async () => ({ success: false, message: 'auth failed' })),
    });
    const wrapped = withPluginDefaults(plugin);

    const result = await wrapped.health({});
    expect(result.success).toBe(false);
    expect(result.message).toBe('auth failed');
  });
});
