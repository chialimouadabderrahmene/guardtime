'use strict';

/**
 * Fallback plugin for every vendor with no official programmatic API
 * (confirmed against each vendor's own developer docs — see
 * backend/src/router-integration/router-capability.matrix.ts). Every
 * mutating method returns success:false with guideOnly:true so callers can
 * show manual setup instructions instead of silently failing or, worse,
 * pretending an unsupported action worked.
 */

function guideOnlyResult(action) {
  return {
    success: false,
    guideOnly: true,
    message: `No official API for this router — ${action} must be done manually in the router's admin panel.`,
  };
}

const GuideOnlyPlugin = {
  async detect() {
    return { success: false, message: 'Guide-only vendor — vendor identity comes from fingerprinting, not this plugin.' };
  },
  async login() {
    return guideOnlyResult('login');
  },
  async testConnection() {
    return guideOnlyResult('connection test');
  },
  async changeDNS() {
    return guideOnlyResult('changing the DNS server');
  },
  async pauseDevice() {
    return guideOnlyResult('pausing this device');
  },
  async disconnectClient() {
    return guideOnlyResult('disconnecting this client');
  },
  async resumeDevice() {
    return guideOnlyResult('resuming this device');
  },
  async applyFirewallRule() {
    return guideOnlyResult('applying a firewall rule');
  },
  async removeFirewallRule() {
    return guideOnlyResult('removing a firewall rule');
  },
  async blockMAC() {
    return guideOnlyResult('blocking this MAC address');
  },
  async unblockMAC() {
    return guideOnlyResult('unblocking this MAC address');
  },
};

module.exports = { GuideOnlyPlugin };
