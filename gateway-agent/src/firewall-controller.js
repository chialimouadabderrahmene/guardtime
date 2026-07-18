'use strict';

const { IptablesController } = require('./iptables-controller');
const { NftablesController } = require('./nftables-controller');

/**
 * Selects the firewall backend (Layer 3: "nftables compatible, iptables
 * compatible"). Defaults to iptables — the backend already in production use
 * — so existing deployments are completely unaffected unless an operator
 * explicitly opts into FIREWALL_BACKEND=nftables.
 *
 * Both backends expose the same `sync()` / `addQuicBlockRule()` shape, so
 * main.js and every caller are backend-agnostic.
 */
function createFirewallController(config, logger) {
  const backend = config.firewallBackend === 'nftables' ? 'nftables' : 'iptables';
  logger.info(`firewall backend: ${backend}`);
  return backend === 'nftables'
    ? new NftablesController(config, logger)
    : new IptablesController(config, logger);
}

module.exports = { createFirewallController };
