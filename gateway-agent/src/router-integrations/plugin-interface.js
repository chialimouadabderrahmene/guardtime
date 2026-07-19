'use strict';

/**
 * Router Integration Engine plugin contract.
 *
 * Every vendor plugin (fritzbox/, mikrotik/, openwrt/, guide-only.js) exports
 * an object implementing every one of these methods. Each method receives a
 * `ctx` object — `{ ipAddress, credentials, logger, dryRun }` — plus a
 * method-specific `target` object, and resolves to:
 *   { success: boolean, message: string, detail?: string }
 *
 * Safety contract: a mutating method (changeDNS/pauseDevice/resumeDevice/
 * disconnectClient/applyFirewallRule/removeFirewallRule/blockMAC/unblockMAC)
 * is responsible for its OWN backup-before / verify-after / restore-on-
 * verify-failure using whatever mechanism fits its protocol (e.g. read the
 * current firewall rule list before adding one, re-read it after, delete
 * the just-added rule if it isn't there). `success: true` therefore already
 * means "verified, not just attempted."
 *
 * router-command-executor.js layers ONE more safety net on top: after any
 * successful mutating call it checks internet connectivity, and if that
 * fails, calls the paired INVERSE method (pauseDevice -> resumeDevice,
 * applyFirewallRule -> removeFirewallRule, blockMAC -> unblockMAC) to
 * restore it — this is the executor's job, not each plugin's.
 *
 * @typedef {object} PluginContext
 * @property {string} ipAddress
 * @property {{username?:string, password?:string, apiKey?:string}|null} credentials
 * @property {object} logger
 * @property {boolean} dryRun
 *
 * @typedef {object} PluginResult
 * @property {boolean} success
 * @property {string} message
 * @property {string} [detail]
 */

const REQUIRED_METHODS = [
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
];

/** Throws with a clear message naming every missing method, rather than failing lazily on first use. */
function assertImplementsPluginInterface(plugin, pluginId) {
  const missing = REQUIRED_METHODS.filter((method) => typeof plugin[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(`router plugin "${pluginId}" is missing required method(s): ${missing.join(', ')}`);
  }
}

module.exports = { REQUIRED_METHODS, assertImplementsPluginInterface };
