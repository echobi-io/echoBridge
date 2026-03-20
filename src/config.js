import { HttpError } from './errors.js';

function parsePositiveInteger(value, fallback, name, max) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(500, 'invalid_config', `${name} must be a positive integer`);
  }

  if (typeof max === 'number' && parsed > max) {
    throw new HttpError(500, 'invalid_config', `${name} must be less than or equal to ${max}`);
  }

  return parsed;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  throw new HttpError(500, 'invalid_config', `Expected a boolean but received ${value}`);
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const authMode = env.AUTH_MODE || 'hmac';

  if (!env.SAGE_ODBC_CONNECTION_STRING) {
    throw new HttpError(500, 'invalid_config', 'SAGE_ODBC_CONNECTION_STRING is required');
  }

  if (!['api-key', 'hmac'].includes(authMode)) {
    throw new HttpError(500, 'invalid_config', 'AUTH_MODE must be either "api-key" or "hmac"');
  }

  if (authMode === 'api-key' && !env.API_KEY) {
    throw new HttpError(500, 'invalid_config', 'API_KEY is required when AUTH_MODE=api-key');
  }

  if (authMode === 'hmac') {
    if (!env.CONNECTOR_CLIENT_ID) {
      throw new HttpError(500, 'invalid_config', 'CONNECTOR_CLIENT_ID is required when AUTH_MODE=hmac');
    }

    if (!env.CONNECTOR_SHARED_SECRET) {
      throw new HttpError(500, 'invalid_config', 'CONNECTOR_SHARED_SECRET is required when AUTH_MODE=hmac');
    }
  }

  return {
    serviceName: env.SERVICE_NAME || 'echoBridge',
    environment: env.NODE_ENV || 'production',
    port: parsePositiveInteger(env.PORT, 8787, 'PORT'),
    host: env.HOST || '0.0.0.0',
    odbcConnectionString: env.SAGE_ODBC_CONNECTION_STRING,
    allowedTables: parseList(env.SAGE_ALLOWED_TABLES).map((entry) => entry.toUpperCase()),
    defaultLimit: parsePositiveInteger(env.SAGE_DEFAULT_LIMIT, 100, 'SAGE_DEFAULT_LIMIT', 1000),
    maxLimit: parsePositiveInteger(env.SAGE_MAX_LIMIT, 1000, 'SAGE_MAX_LIMIT', 10000),
    authMode,
    apiKey: env.API_KEY || '',
    clientId: env.CONNECTOR_CLIENT_ID || '',
    sharedSecret: env.CONNECTOR_SHARED_SECRET || '',
    allowedClockSkewMs: parsePositiveInteger(env.ALLOWED_CLOCK_SKEW_MS, 300000, 'ALLOWED_CLOCK_SKEW_MS', 3600000),
    bodyLimitBytes: parsePositiveInteger(env.BODY_LIMIT_BYTES, 32768, 'BODY_LIMIT_BYTES', 1048576),
    requestTimeoutMs: parsePositiveInteger(env.REQUEST_TIMEOUT_MS, 30000, 'REQUEST_TIMEOUT_MS', 300000),
    enableSqlEndpoint: parseBoolean(env.ENABLE_SQL_ENDPOINT, false),
    logQueryText: parseBoolean(env.LOG_QUERY_TEXT, false),
    rateLimitWindowMs: parsePositiveInteger(env.RATE_LIMIT_WINDOW_MS, 60000, 'RATE_LIMIT_WINDOW_MS', 3600000),
    rateLimitMaxRequests: parsePositiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 120, 'RATE_LIMIT_MAX_REQUESTS', 100000),
    trustProxy: parseBoolean(env.TRUST_PROXY, false),
  };
}
