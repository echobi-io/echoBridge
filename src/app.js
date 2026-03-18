import http from 'node:http';
import { URL } from 'node:url';
import { buildTableReadQuery } from './lib/sql-builder.js';
import { assertReadOnlySql, ensureTableAllowed } from './lib/query-guards.js';
import { SageOdbcClient } from './sage-odbc.js';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function unauthorized(response) {
  sendJson(response, 401, { error: 'Unauthorized' });
}

function notFound(response) {
  sendJson(response, 404, { error: 'Not Found' });
}

export function createServer(config, client = new SageOdbcClient(config.odbcConnectionString)) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

      if (url.pathname === '/health' && request.method === 'GET') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (request.headers['x-api-key'] !== config.apiKey) {
        unauthorized(response);
        return;
      }

      if (url.pathname === '/tables' && request.method === 'GET') {
        const tables = await client.listTables();
        sendJson(response, 200, { tables, allowedTables: config.allowedTables });
        return;
      }

      const schemaMatch = url.pathname.match(/^\/tables\/([^/]+)\/schema$/);
      if (schemaMatch && request.method === 'GET') {
        const table = ensureTableAllowed(schemaMatch[1], config.allowedTables);
        const columns = await client.describeTable(table);
        sendJson(response, 200, { table, columns });
        return;
      }

      const rowsMatch = url.pathname.match(/^\/tables\/([^/]+)\/rows$/);
      if (rowsMatch && request.method === 'GET') {
        const table = ensureTableAllowed(rowsMatch[1], config.allowedTables);
        const columns = url.searchParams.get('columns')
          ?.split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        const limit = url.searchParams.get('limit') ? Number.parseInt(url.searchParams.get('limit'), 10) : config.defaultLimit;
        const offset = url.searchParams.get('offset') ? Number.parseInt(url.searchParams.get('offset'), 10) : 0;
        const orderBy = url.searchParams.get('orderBy') || undefined;
        const orderDirection = url.searchParams.get('orderDirection') || undefined;
        const { sql } = buildTableReadQuery({
          table,
          allowedTables: config.allowedTables,
          columns,
          limit,
          maxLimit: config.maxLimit,
          offset,
          orderBy,
          orderDirection,
        });
        const result = await client.query(sql);
        sendJson(response, 200, { table, sql, rowCount: result.rows.length, rows: result.rows });
        return;
      }

      if (url.pathname === '/query' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const sql = assertReadOnlySql(String(body.sql || ''));
        const result = await client.query(sql);
        sendJson(response, 200, { sql, rowCount: result.rows.length, rows: result.rows });
        return;
      }

      notFound(response);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Unexpected error' });
    }
  });

  server.on('close', async () => {
    await client.close();
  });

  return server;
}
