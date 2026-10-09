// Structured single-line JSON logs, so `docker logs` output can be queried and
// the access log can be shipped somewhere without reparsing prose.

function emit(level, message, fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  info: (message, fields) => emit('info', message, fields),
  warn: (message, fields) => emit('warn', message, fields),
  error: (message, fields) => emit('error', message, fields),
};
