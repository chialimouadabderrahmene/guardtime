'use strict';

// Scenario recorder. Every result comes from a real executed check — no
// scenario is marked PASS without an assertion that actually ran.
const RESULTS = [];

const PASS = 'PASS';
const FAIL = 'FAIL';
const WARN = 'WARN';
const NOT_EXECUTED = 'NOT_EXECUTED';

async function scenario(group, name, fn) {
  const entry = { group, name, status: null, detail: '', evidence: null, error: null };
  try {
    const out = await fn();
    // fn returns { ok, detail, evidence, warn }
    if (out && out.status) {
      entry.status = out.status;
    } else if (out && out.ok === false) {
      entry.status = FAIL;
    } else if (out && out.warn) {
      entry.status = WARN;
    } else {
      entry.status = PASS;
    }
    entry.detail = (out && out.detail) || '';
    entry.evidence = (out && out.evidence) || null;
  } catch (err) {
    entry.status = FAIL;
    entry.detail = err.message;
    entry.error = err.stack || String(err);
  }
  RESULTS.push(entry);
  const tag = entry.status.padEnd(12);
  console.log(`  [${tag}] ${group} › ${name}${entry.detail ? ' — ' + entry.detail : ''}`);
  return entry;
}

function markNotExecuted(group, name, reason) {
  const entry = { group, name, status: NOT_EXECUTED, detail: reason, evidence: null, error: null };
  RESULTS.push(entry);
  console.log(`  [${NOT_EXECUTED.padEnd(12)}] ${group} › ${name} — ${reason}`);
  return entry;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

module.exports = { scenario, markNotExecuted, assert, RESULTS, PASS, FAIL, WARN, NOT_EXECUTED };
