'use strict';

const { createFirewallController } = require('../src/firewall-controller');
const { IptablesController } = require('../src/iptables-controller');
const { NftablesController } = require('../src/nftables-controller');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('createFirewallController', () => {
  it('defaults to IptablesController when firewallBackend is unset', () => {
    const controller = createFirewallController({ firewallBackend: undefined }, fakeLogger());
    expect(controller).toBeInstanceOf(IptablesController);
  });

  it('selects IptablesController for any value other than "nftables"', () => {
    const controller = createFirewallController({ firewallBackend: 'iptables' }, fakeLogger());
    expect(controller).toBeInstanceOf(IptablesController);
    expect(controller).not.toBeInstanceOf(NftablesController);
  });

  it('selects NftablesController when firewallBackend is "nftables"', () => {
    const controller = createFirewallController({ firewallBackend: 'nftables' }, fakeLogger());
    expect(controller).toBeInstanceOf(NftablesController);
  });

  it('logs which backend was selected', () => {
    const logger = fakeLogger();
    createFirewallController({ firewallBackend: 'nftables' }, logger);
    expect(logger.info).toHaveBeenCalledWith('firewall backend: nftables');
  });
});
