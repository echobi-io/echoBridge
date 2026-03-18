function parsePositiveInteger(value, fallback, name, max) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  if (typeof max === 'number' && parsed > max) {
    throw new Error(`${name} must be less than or equal to ${max}`);
  }

  return parsed;
}

export function loadConfig(env = process.env) {
  if (!env.SAGE_ODBC_CONNECTION_STRING) {
    throw new Error('SAGE_ODBC_CONNECTION_STRING is required');
  }

  if (!env.API_KEY) {
    throw new Error('API_KEY is required');
  }

  return {
    port: parsePositiveInteger(env.PORT, 8787, 'PORT'),
    host: env.HOST || '0.0.0.0',
    odbcConnectionString: env.SAGE_ODBC_CONNECTION_STRING,
    allowedTables: (env.SAGE_ALLOWED_TABLES || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.toUpperCase()),
    defaultLimit: parsePositiveInteger(env.SAGE_DEFAULT_LIMIT, 100, 'SAGE_DEFAULT_LIMIT', 1000),
    maxLimit: parsePositiveInteger(env.SAGE_MAX_LIMIT, 1000, 'SAGE_MAX_LIMIT', 10000),
    apiKey: env.API_KEY,
  };
}
