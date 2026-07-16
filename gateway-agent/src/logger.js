'use strict';

function stamp() {
  return new Date().toISOString();
}

function log(level, message, meta) {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${stamp()}] ${level.toUpperCase()} ${message}${suffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => {
    if (process.env.LOG_LEVEL === 'debug') log('debug', message, meta);
  },
};
