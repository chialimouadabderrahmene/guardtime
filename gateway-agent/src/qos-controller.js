'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const ROOT_HANDLE = '1:';
const ROOT_CLASS = '1:1';
const THROTTLE_CLASS = '1:10';
const DEFAULT_CLASS = '1:30';

class QosController {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async sync(targets) {
    if (!this.config.enableQos || this.config.qosInterfaces.length === 0) return;

    const throttled = targets.filter((target) => target.action === 'THROTTLE' && target.ipAddress);

    for (const iface of this.config.qosInterfaces) {
      await this.ensureQdisc(iface);
      await this.clearFilters(iface);
      for (const target of throttled) {
        await this.addThrottleFilters(iface, target.ipAddress);
      }
    }
  }

  async ensureQdisc(iface) {
    await this.run(['qdisc', 'replace', 'dev', iface, 'root', 'handle', ROOT_HANDLE, 'htb', 'default', '30']);
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_HANDLE,
      'classid', ROOT_CLASS,
      'htb', 'rate', this.config.qosDefaultRate,
    ]);
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_CLASS,
      'classid', THROTTLE_CLASS,
      'htb', 'rate', this.config.qosRate,
      'ceil', this.config.qosRate,
    ]);
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_CLASS,
      'classid', DEFAULT_CLASS,
      'htb', 'rate', this.config.qosDefaultRate,
    ]);
  }

  async clearFilters(iface) {
    await this.run(['filter', 'del', 'dev', iface, 'protocol', 'ip', 'parent', ROOT_HANDLE], {
      ignoreFailure: true,
      quiet: true,
    });
  }

  async addThrottleFilters(iface, ipAddress) {
    await this.run([
      'filter', 'add', 'dev', iface,
      'protocol', 'ip',
      'parent', ROOT_HANDLE,
      'prio', '10',
      'u32',
      'match', 'ip', 'src', ipAddress,
      'flowid', THROTTLE_CLASS,
    ]);
    await this.run([
      'filter', 'add', 'dev', iface,
      'protocol', 'ip',
      'parent', ROOT_HANDLE,
      'prio', '11',
      'u32',
      'match', 'ip', 'dst', ipAddress,
      'flowid', THROTTLE_CLASS,
    ]);
  }

  async run(args, opts = {}) {
    const command = `${this.config.tcBin} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(this.config.tcBin, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

module.exports = { QosController };
