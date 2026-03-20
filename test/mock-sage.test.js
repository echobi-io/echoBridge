import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { MockSageClient } from '../src/mock-sage.js';

test('mock sage client lists tables and schemas from fixture data', async () => {
  const client = new MockSageClient(path.join('mock-data', 'sage-sample.json'));

  const tables = await client.listTables();
  assert.equal(tables.some((table) => table.TABLE_NAME === 'CUSTOMER'), true);

  const schema = await client.describeTable('CUSTOMER');
  assert.equal(schema[0].COLUMN_NAME, 'ACCOUNT_REF');
});

test('mock sage client executes simple select queries', async () => {
  const client = new MockSageClient(path.join('mock-data', 'sage-sample.json'));
  const result = await client.query('SELECT ACCOUNT_REF, NAME FROM CUSTOMER ORDER BY ACCOUNT_REF ASC LIMIT 2 OFFSET 1');

  assert.deepEqual(result.rows, [
    { ACCOUNT_REF: 'BETA002', NAME: 'Beta Services' },
    { ACCOUNT_REF: 'NOVA003', NAME: 'Nova Retail' },
  ]);
});
