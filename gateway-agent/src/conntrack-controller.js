'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

class ConntrackController {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async killDevice(ipAddress) {
    if (!this.config.enableConntrackKill || !ipAddress) return;

    await this.deleteBySource(ipAddress);
    await this.deleteByDestination(ipAddress);
  }

  async listTcpConnections(ipAddress) {
    if (!ipAddress) return [];
    const bySource = await this.list(['-L', '-p', 'tcp', '-s', ipAddress], 'tcp');
    const byDestination = await this.list(['-L', '-p', 'tcp', '-d', ipAddress], 'tcp');
    return uniqueConnections([...bySource, ...byDestination]);
  }

  /** Layer 5: UDP flows are where VPN protocols (WireGuard/OpenVPN/IKEv2) live. */
  async listUdpConnections(ipAddress) {
    if (!ipAddress) return [];
    const bySource = await this.list(['-L', '-p', 'udp', '-s', ipAddress], 'udp');
    return uniqueConnections(bySource);
  }

  async deleteBySource(ipAddress) {
    await this.run(['-D', '-s', ipAddress], { ignoreFailure: true });
  }

  async deleteByDestination(ipAddress) {
    await this.run(['-D', '-d', ipAddress], { ignoreFailure: true });
  }

  async list(args, protocol = 'tcp') {
    const result = await this.run(args, { ignoreFailure: true, quiet: true });
    if (!result.ok) return [];
    return result.stdout
      .split(/\r?\n/)
      .map((line) => parseConntrackLine(line, protocol))
      .filter(Boolean);
  }

  async run(args, opts = {}) {
    const command = `${this.config.conntrackBin} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(this.config.conntrackBin, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) {
        if (!opts.quiet) this.logger.debug(`${command} returned no matching entries`);
        return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      }
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

function parseConntrackLine(line, protocol = 'tcp') {
  if (!line.includes(protocol)) return null;
  const pairs = [...line.matchAll(/\b(src|dst|sport|dport)=([^\s]+)/g)].map((match) => [match[1], match[2]]);
  if (pairs.length < 4) return null;

  const original = {};
  for (const [key, value] of pairs) {
    if (original[key] === undefined) original[key] = value;
  }

  if (!original.src || !original.dst || !original.sport || !original.dport) return null;
  return {
    src: original.src,
    dst: original.dst,
    sport: Number.parseInt(original.sport, 10),
    dport: Number.parseInt(original.dport, 10),
  };
}

function uniqueConnections(connections) {
  const map = new Map();
  for (const connection of connections) {
    const key = `${connection.src}:${connection.sport}->${connection.dst}:${connection.dport}`;
    map.set(key, connection);
  }
  return [...map.values()];
}

module.exports = { ConntrackController };
