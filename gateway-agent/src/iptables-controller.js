'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const FILTER_CHAIN = 'GUARDTIME_BLOCK';
const DNS_CHAIN = 'GUARDTIME_DNS';

class IptablesController {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async sync({ targets, dnsRedirectIp, enableDnsRedirect }) {
    await this.ensureFilterChain();
    await this.flushFilterChain();

    for (const target of targets) {
      if (target.action !== 'BLOCK') continue;
      await this.addBlockRules(target);
    }

    if (enableDnsRedirect) {
      await this.ensureDnsRedirect(dnsRedirectIp);
    }
  }

  async ensureFilterChain() {
    await this.run(['-N', FILTER_CHAIN], { ignoreFailure: true });
    await this.ensureRule(['-C', 'FORWARD', '-j', FILTER_CHAIN], ['-I', 'FORWARD', '1', '-j', FILTER_CHAIN]);
  }

  async flushFilterChain() {
    await this.run(['-F', FILTER_CHAIN]);
  }

  async addBlockRules(target) {
    const comment = `guardtime:${target.deviceId}`;

    if (target.ipAddress) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-s', target.ipAddress,
        '-m', 'comment', '--comment', `${comment}:ip`,
        '-j', 'DROP',
      ]);
    }

    if (target.macAddress) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-m', 'mac', '--mac-source', target.macAddress,
        '-m', 'comment', '--comment', `${comment}:mac`,
        '-j', 'DROP',
      ]);
    }
  }

  async ensureDnsRedirect(dnsRedirectIp) {
    await this.run(['-t', 'nat', '-N', DNS_CHAIN], { ignoreFailure: true });
    await this.run(['-t', 'nat', '-F', DNS_CHAIN]);
    await this.ensureNatRule(
      ['-t', 'nat', '-C', 'PREROUTING', '-p', 'udp', '--dport', '53', '-j', DNS_CHAIN],
      ['-t', 'nat', '-I', 'PREROUTING', '1', '-p', 'udp', '--dport', '53', '-j', DNS_CHAIN],
    );
    await this.ensureNatRule(
      ['-t', 'nat', '-C', 'PREROUTING', '-p', 'tcp', '--dport', '53', '-j', DNS_CHAIN],
      ['-t', 'nat', '-I', 'PREROUTING', '1', '-p', 'tcp', '--dport', '53', '-j', DNS_CHAIN],
    );

    await this.run([
      '-t', 'nat',
      '-A', DNS_CHAIN,
      '-p', 'udp',
      '--dport', '53',
      '-j', 'DNAT',
      '--to-destination', `${dnsRedirectIp}:53`,
    ]);
    await this.run([
      '-t', 'nat',
      '-A', DNS_CHAIN,
      '-p', 'tcp',
      '--dport', '53',
      '-j', 'DNAT',
      '--to-destination', `${dnsRedirectIp}:53`,
    ]);
  }

  async ensureRule(checkArgs, addArgs) {
    const exists = await this.run(checkArgs, { ignoreFailure: true, quiet: true });
    if (!exists.ok) await this.run(addArgs);
  }

  async ensureNatRule(checkArgs, addArgs) {
    const exists = await this.run(checkArgs, { ignoreFailure: true, quiet: true });
    if (!exists.ok) await this.run(addArgs);
  }

  async run(args, opts = {}) {
    const command = `${this.config.iptablesBin} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(this.config.iptablesBin, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

module.exports = { IptablesController };
