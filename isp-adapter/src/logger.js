'use strict';

function write(level, message, meta) {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  debug: (message, meta) => {
    if (process.env.LOG_LEVEL === 'debug') write('debug', message, meta);
  },
};
