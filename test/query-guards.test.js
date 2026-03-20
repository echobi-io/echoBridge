import test from 'node:test';
import assert from 'node:assert/strict';
import { signRequest } from '../src/lib/auth.js';
import { assertReadOnlySql, ensureTableAllowed, normalizeSortDirection, parseColumnList } from '../src/lib/query-guards.js';
import { buildTableReadQuery } from '../src/lib/sql-builder.js';
import { createServer } from '../src/app.js';

class FakeClient {
  async healthcheck() {
    return { status: 'ok' };
  }

  async listTables() {
    return [{ TABLE_NAME: 'CUSTOMER' }];
  }

  async describeTable(table) {
    return [{ TABLE_NAME: table, COLUMN_NAME: 'ACCOUNT_REF' }];
  }

  async query(sql) {
    return { rows: [{ sql }] };
  }

  async close() {}
}

const testConfig = {
  serviceName: 'echoBridge-test',
  environment: 'test',
  port: 0,
  host: '127.0.0.1',
  odbcConnectionString: 'DSN=Dummy',
  allowedTables: ['CUSTOMER'],
  defaultLimit: 100,
  maxLimit: 1000,
  authMode: 'hmac',
  apiKey: '',
  clientId: 'supabase-edge',
  sharedSecret: 'super-secret',
  allowedClockSkewMs: 300000,
  bodyLimitBytes: 32768,
  requestTimeoutMs: 30000,
  enableSqlEndpoint: false,
  logQueryText: false,
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 120,
  trustProxy: false,
};

function startTestServer() {
  const server = createServer(testConfig, new FakeClient());

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function stopTestServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function signedFetch(server, path, options = {}) {
  const address = server.address();
  const body = options.body || '';
  const timestamp = Date.now().toString();
  const signature = signRequest({
    method: options.method || 'GET',
    pathname: path,
    timestamp,
    body,
    secret: testConfig.sharedSecret,
  });

  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-client-id': testConfig.clientId,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
  });
}

test('allows a simple select statement', () => {
  assert.equal(assertReadOnlySql('SELECT * FROM SALES_LEDGER'), 'SELECT * FROM SALES_LEDGER');
});

test('rejects mutating SQL', () => {
  assert.throws(() => assertReadOnlySql('DELETE FROM SALES_LEDGER'), /Only SELECT statements are allowed/);
  assert.throws(() => assertReadOnlySql('SELECT * FROM SALES_LEDGER; DROP TABLE USERS'), /Forbidden SQL token detected/);
});

test('normalizes valid sort directions', () => {
  assert.equal(normalizeSortDirection('desc'), 'DESC');
});

test('parses safe column lists', () => {
  assert.deepEqual(parseColumnList('ACCOUNT_REF, NAME'), ['ACCOUNT_REF', 'NAME']);
});

test('enforces the allow-list', () => {
  assert.equal(ensureTableAllowed('customer', ['CUSTOMER']), 'CUSTOMER');
  assert.throws(() => ensureTableAllowed('supplier', ['CUSTOMER']), /allow-list/);
});

test('builds a bounded table read query', () => {
  const query = buildTableReadQuery({
    table: 'customer',
    allowedTables: ['CUSTOMER'],
    columns: ['ACCOUNT_REF', 'NAME'],
    limit: 5000,
    defaultLimit: 100,
    maxLimit: 1000,
    offset: 20,
    orderBy: 'ACCOUNT_REF',
    orderDirection: 'asc',
  });

  assert.equal(
    query.sql,
    'SELECT ACCOUNT_REF, NAME FROM CUSTOMER ORDER BY ACCOUNT_REF ASC LIMIT 1000 OFFSET 20',
  );
});

test('health endpoint remains unauthenticated', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 200);
  } finally {
    await stopTestServer(server);
  }
});

test('signed requests can access table rows', async () => {
  const server = await startTestServer();

  try {
    const response = await signedFetch(server, '/v1/tables/CUSTOMER/rows?limit=10');
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.table, 'CUSTOMER');
    assert.equal(payload.rowCount, 1);
  } finally {
    await stopTestServer(server);
  }
});

test('unsigned requests are rejected', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/tables`);
    assert.equal(response.status, 401);
  } finally {
    await stopTestServer(server);
  }
});

test('custom sql endpoint is disabled by default', async () => {
  const server = await startTestServer();

  try {
    const body = JSON.stringify({ sql: 'SELECT * FROM CUSTOMER' });
    const response = await signedFetch(server, '/v1/query', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});
