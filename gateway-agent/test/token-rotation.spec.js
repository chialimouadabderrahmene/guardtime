'use strict';

jest.mock('node:fs/promises');
const fs = require('node:fs/promises');

const { persistRotatedToken, applyRotatedToken } = require('../src/token-rotation');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function enoent() {
  const err = new Error('no such file');
  err.code = 'ENOENT';
  return err;
}

describe('persistRotatedToken', () => {
  beforeEach(() => {
    fs.readFile.mockReset();
    fs.writeFile.mockReset().mockResolvedValue(undefined);
  });

  it('replaces an existing GATEWAY_TOKEN= line in place, preserving every other line', async () => {
    fs.readFile.mockResolvedValue('BACKEND_URL=https://api.example.test\nGATEWAY_TOKEN=old-tok\nDRY_RUN=false\n');

    await persistRotatedToken('/fake/.env', 'new-tok');

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/fake/.env',
      'BACKEND_URL=https://api.example.test\nGATEWAY_TOKEN=new-tok\nDRY_RUN=false\n',
      'utf8',
    );
  });

  it('appends a GATEWAY_TOKEN= line when the file has none', async () => {
    fs.readFile.mockResolvedValue('BACKEND_URL=https://api.example.test\n');

    await persistRotatedToken('/fake/.env', 'new-tok');

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/fake/.env',
      'BACKEND_URL=https://api.example.test\nGATEWAY_TOKEN=new-tok\n',
      'utf8',
    );
  });

  it('creates the file with just the token when .env does not exist yet', async () => {
    fs.readFile.mockRejectedValue(enoent());

    await persistRotatedToken('/fake/.env', 'new-tok');

    expect(fs.writeFile).toHaveBeenCalledWith('/fake/.env', 'GATEWAY_TOKEN=new-tok\n', 'utf8');
  });

  it('leaves comments and unrelated keys untouched', async () => {
    fs.readFile.mockResolvedValue('# comment\nGATEWAY_TOKEN=old-tok\nENABLE_DOH_BLOCK=true\n');

    await persistRotatedToken('/fake/.env', 'new-tok');

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/fake/.env',
      '# comment\nGATEWAY_TOKEN=new-tok\nENABLE_DOH_BLOCK=true\n',
      'utf8',
    );
  });

  it('propagates a non-ENOENT read failure', async () => {
    const err = new Error('permission denied');
    err.code = 'EACCES';
    fs.readFile.mockRejectedValue(err);

    await expect(persistRotatedToken('/fake/.env', 'new-tok')).rejects.toThrow('permission denied');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('applyRotatedToken', () => {
  beforeEach(() => {
    fs.readFile.mockReset().mockResolvedValue('GATEWAY_TOKEN=old-tok\n');
    fs.writeFile.mockReset().mockResolvedValue(undefined);
  });

  it('updates backend.gatewayToken and config.gatewayToken in-memory immediately', async () => {
    const backend = { gatewayToken: 'old-tok' };
    const config = { gatewayToken: 'old-tok' };
    const logger = fakeLogger();

    await applyRotatedToken({ backend, config, logger, envFilePath: '/fake/.env' }, 'new-tok');

    expect(backend.gatewayToken).toBe('new-tok');
    expect(config.gatewayToken).toBe('new-tok');
  });

  it('persists the new token to the given .env path', async () => {
    const backend = { gatewayToken: 'old-tok' };
    const config = { gatewayToken: 'old-tok' };
    const logger = fakeLogger();

    await applyRotatedToken({ backend, config, logger, envFilePath: '/fake/.env' }, 'new-tok');

    expect(fs.writeFile).toHaveBeenCalledWith('/fake/.env', 'GATEWAY_TOKEN=new-tok\n', 'utf8');
  });

  it('is a no-op when the new token is the same as the current one', async () => {
    const backend = { gatewayToken: 'same-tok' };
    const config = { gatewayToken: 'same-tok' };
    const logger = fakeLogger();

    await applyRotatedToken({ backend, config, logger, envFilePath: '/fake/.env' }, 'same-tok');

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('is a no-op when no new token is given', async () => {
    const backend = { gatewayToken: 'old-tok' };
    const config = { gatewayToken: 'old-tok' };
    const logger = fakeLogger();

    await applyRotatedToken({ backend, config, logger, envFilePath: '/fake/.env' }, undefined);

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('logs a warning describing the rotation', async () => {
    const backend = { gatewayToken: 'old-tok' };
    const config = { gatewayToken: 'old-tok' };
    const logger = fakeLogger();

    await applyRotatedToken({ backend, config, logger, envFilePath: '/fake/.env' }, 'new-tok');

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('token rotated'));
  });

  it('keeps the in-memory update even when persisting to .env fails, and logs the failure instead of throwing', async () => {
    fs.writeFile.mockRejectedValue(new Error('disk full'));
    const backend = { gatewayToken: 'old-tok' };
    const config = { gatewayToken: 'old-tok' };
    const logger = fakeLogger();

    await expect(applyRotatedToken({ backend, config, logger, envFilePath: '/fake/.env' }, 'new-tok')).resolves.toBeUndefined();

    expect(backend.gatewayToken).toBe('new-tok');
    expect(config.gatewayToken).toBe('new-tok');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to persist'), expect.objectContaining({ error: 'disk full' }));
  });
});
