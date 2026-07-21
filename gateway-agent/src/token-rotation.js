'use strict';

const fs = require('node:fs/promises');

/**
 * Persists a rotated GATEWAY_TOKEN into the agent's .env file: upserts the
 * `GATEWAY_TOKEN=` line if one already exists, appends it otherwise, and
 * leaves every other line untouched. A restart after this write picks up
 * the same token the running process already switched to in-memory (see
 * applyRotatedToken below) instead of falling back to the old one.
 */
async function persistRotatedToken(envFilePath, newToken) {
  let content = '';
  try {
    content = await fs.readFile(envFilePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  // Drop any trailing blank line(s) from the source file's own trailing
  // newline(s) — join() always re-adds exactly one at the end below, so
  // keeping these would double it up.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  let replaced = false;
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line;
    const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
    if (key !== 'GATEWAY_TOKEN') return line;
    replaced = true;
    return `GATEWAY_TOKEN=${newToken}`;
  });

  if (!replaced) {
    updatedLines.push(`GATEWAY_TOKEN=${newToken}`);
  }

  await fs.writeFile(envFilePath, `${updatedLines.join('\n')}\n`, 'utf8');
}

/**
 * Applies a backend-issued token rotation (backend/src/gateway/gateway.service.ts's
 * getPolicies() `rotatedToken` field, only ever present when this request
 * authenticated via a just-rotated-out previous token) to the CURRENTLY
 * RUNNING process: updates the live BackendClient + config immediately, so
 * the very next outgoing request already signs with the new token, and
 * persists it to .env so a restart doesn't fall back to the old one.
 *
 * A no-op when there's nothing to do (already on this token). File-write
 * failures are logged, not thrown — the in-memory update already
 * succeeded, which is what matters for this process's continued
 * operation; the old token is still valid for the remainder of its grace
 * period, so a restart before the write can be retried doesn't break
 * anything immediately.
 */
async function applyRotatedToken({ backend, config, logger, envFilePath }, newToken) {
  if (!newToken || newToken === config.gatewayToken) return;

  logger.warn('gateway token rotated by backend — updating in-memory token and persisting to .env');
  backend.gatewayToken = newToken;
  config.gatewayToken = newToken;

  try {
    await persistRotatedToken(envFilePath, newToken);
  } catch (err) {
    logger.error('failed to persist rotated gateway token to .env — will retry next cycle if still rotated', {
      error: err.message,
    });
  }
}

module.exports = { persistRotatedToken, applyRotatedToken };
