'use strict';

const { GLiNetPlugin } = require('../src/router-integrations/glinet');
const { OpenWrtPlugin } = require('../src/router-integrations/openwrt');
const { assertImplementsPluginInterface, REQUIRED_METHODS } = require('../src/router-integrations/plugin-interface');

describe('GLiNetPlugin', () => {
  it('is the exact same object as OpenWrtPlugin — a deliberate re-export, not a reimplementation', () => {
    expect(GLiNetPlugin).toBe(OpenWrtPlugin);
  });

  it('satisfies the full plugin interface contract (inherited from OpenWrtPlugin)', () => {
    expect(() => assertImplementsPluginInterface(GLiNetPlugin, 'glinet')).not.toThrow();
    for (const method of REQUIRED_METHODS) {
      expect(typeof GLiNetPlugin[method]).toBe('function');
    }
  });
});
