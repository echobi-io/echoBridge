import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnlySql, ensureTableAllowed, normalizeSortDirection } from '../src/lib/query-guards.js';
import { buildTableReadQuery } from '../src/lib/sql-builder.js';

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
