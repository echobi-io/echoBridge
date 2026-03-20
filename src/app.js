import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';
import { HttpError, isHttpError } from './errors.js';
import { createDataClient } from './data-client.js';
import { authenticateRequest } from './lib/auth.js';
import { parseColumnList, assertReadOnlySql, ensureTableAllowed } from './lib/query-guards.js';
import { InMemoryRateLimiter } from './lib/rate-limit.js';
import { buildTableReadQuery } from './lib/sql-builder.js';

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readRawBody(request, limitBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > limitBytes) {
      throw new HttpError(413, 'payload_too_large', `Request body exceeds ${limitBytes} bytes`);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function parseJsonBody(rawBody) {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

function toPathname(url) {
  return url.pathname + (url.search || '');
}

function getRemoteAddress(request, trustProxy) {
  if (trustProxy) {
    const forwardedFor = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwardedFor) {
      return forwardedFor;
    }
  }

  return request.socket.remoteAddress || 'unknown';
}

function createRequestLogger(config, requestId, request, metadata = {}) {
  const base = {
    service: config.serviceName,
    environment: config.environment,
    requestId,
    method: request.method,
    path: request.url,
    remoteAddress: metadata.remoteAddress,
  };

  return {
    info(message, extra = {}) {
      console.log(JSON.stringify({ level: 'info', message, ...base, ...extra }));
    },
    error(message, extra = {}) {
      console.error(JSON.stringify({ level: 'error', message, ...base, ...extra }));
    },
  };
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new HttpError(504, 'upstream_timeout', 'ODBC request timed out')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function routeNotFound(method, pathname) {
  throw new HttpError(404, 'not_found', `No route found for ${method} ${pathname}`);
}

export function createServer(config, client = createDataClient(config)) {
  const rateLimiter = new InMemoryRateLimiter({
    maxRequests: config.rateLimitMaxRequests,
    windowMs: config.rateLimitWindowMs,
  });

  const server = http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const remoteAddress = getRemoteAddress(request, config.trustProxy);
    const logger = createRequestLogger(config, requestId, request, { remoteAddress });
    response.setHeader('x-request-id', requestId);

    try {
      rateLimiter.cleanup();
      rateLimiter.check(remoteAddress);

      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = request.method || 'GET';
      const rawBody = ['POST', 'PUT', 'PATCH'].includes(method)
        ? await readRawBody(request, config.bodyLimitBytes)
        : '';

      if (pathname === '/health' && method === 'GET') {
        sendJson(response, 200, {
          status: 'ok',
          service: config.serviceName,
          environment: config.environment,
          authMode: config.authMode,
        });
        logger.info('health check succeeded', { statusCode: 200, durationMs: Date.now() - startedAt });
        return;
      }

      if (pathname === '/ready' && method === 'GET') {
        await withTimeout(client.healthcheck(), config.requestTimeoutMs);
        sendJson(response, 200, { status: 'ready' });
        logger.info('readiness check succeeded', { statusCode: 200, durationMs: Date.now() - startedAt });
        return;
      }

      authenticateRequest({
        config,
        headers: request.headers,
        method,
        pathname: toPathname(url),
        rawBody,
      });

      if (pathname === '/v1/metadata' && method === 'GET') {
        sendJson(response, 200, {
          service: config.serviceName,
          environment: config.environment,
          authMode: config.authMode,
          sqlEndpointEnabled: config.enableSqlEndpoint,
          dataSourceMode: config.dataSourceMode,
          allowedTables: config.allowedTables,
          limits: {
            defaultLimit: config.defaultLimit,
            maxLimit: config.maxLimit,
            requestTimeoutMs: config.requestTimeoutMs,
            bodyLimitBytes: config.bodyLimitBytes,
          },
        });
        logger.info('metadata served', { statusCode: 200, durationMs: Date.now() - startedAt });
        return;
      }

      if (pathname === '/v1/tables' && method === 'GET') {
        const tables = await withTimeout(client.listTables(), config.requestTimeoutMs);
        sendJson(response, 200, { tables, allowedTables: config.allowedTables });
        logger.info('tables listed', { statusCode: 200, durationMs: Date.now() - startedAt, tableCount: tables.length });
        return;
      }

      const schemaMatch = pathname.match(/^\/v1\/tables\/([^/]+)\/schema$/);
      if (schemaMatch && method === 'GET') {
        const table = ensureTableAllowed(schemaMatch[1], config.allowedTables);
        const columns = await withTimeout(client.describeTable(table), config.requestTimeoutMs);
        sendJson(response, 200, { table, columns });
        logger.info('table schema served', { statusCode: 200, durationMs: Date.now() - startedAt, table });
        return;
      }

      const rowsMatch = pathname.match(/^\/v1\/tables\/([^/]+)\/rows$/);
      if (rowsMatch && method === 'GET') {
        const columns = parseColumnList(url.searchParams.get('columns'));
        const { sql, table, limit, offset } = buildTableReadQuery({
          table: rowsMatch[1],
          allowedTables: config.allowedTables,
          columns,
          limit: url.searchParams.get('limit'),
          defaultLimit: config.defaultLimit,
          maxLimit: config.maxLimit,
          offset: url.searchParams.get('offset'),
          orderBy: url.searchParams.get('orderBy') || undefined,
          orderDirection: url.searchParams.get('orderDirection') || undefined,
        });
        const result = await withTimeout(client.query(sql), config.requestTimeoutMs);
        sendJson(response, 200, {
          table,
          limit,
          offset,
          rowCount: result.rows.length,
          rows: result.rows,
        });
        logger.info('table rows served', {
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          table,
          limit,
          offset,
          rowCount: result.rows.length,
          sql: config.logQueryText ? sql : undefined,
        });
        return;
      }

      if (pathname === '/v1/query' && method === 'POST') {
        if (!config.enableSqlEndpoint) {
          throw new HttpError(403, 'sql_endpoint_disabled', 'ENABLE_SQL_ENDPOINT must be true to use /v1/query');
        }

        const body = parseJsonBody(rawBody);
        const sql = assertReadOnlySql(body.sql);
        const result = await withTimeout(client.query(sql), config.requestTimeoutMs);
        sendJson(response, 200, { rowCount: result.rows.length, rows: result.rows });
        logger.info('custom sql executed', {
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          rowCount: result.rows.length,
          sql: config.logQueryText ? sql : undefined,
        });
        return;
      }

      routeNotFound(method, pathname);
    } catch (error) {
      const httpError = isHttpError(error)
        ? error
        : new HttpError(500, 'internal_error', 'Unexpected error', {
            cause: error instanceof Error ? error.message : 'unknown error',
          });
      sendJson(response, httpError.statusCode, {
        error: {
          code: httpError.code,
          message: httpError.message,
          requestId,
          details: httpError.details,
        },
      });
      logger.error('request failed', {
        statusCode: httpError.statusCode,
        durationMs: Date.now() - startedAt,
        errorCode: httpError.code,
        errorMessage: httpError.message,
      });
    }
  });

  server.requestTimeout = config.requestTimeoutMs + 1000;
  server.headersTimeout = Math.min(config.requestTimeoutMs + 5000, 60000);
  server.keepAliveTimeout = 5000;

  server.on('close', async () => {
    await client.close();
  });

  return server;
}
