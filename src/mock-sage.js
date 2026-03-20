import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './errors.js';

function normalizeFixtureTableName(tableName) {
  return String(tableName || '').trim().toUpperCase();
}

function parseSelectQuery(sql) {
  const normalized = String(sql || '').trim();
  const match = normalized.match(
    /^SELECT\s+(.+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+ORDER\s+BY\s+([A-Za-z_][A-Za-z0-9_]*)\s+(ASC|DESC))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/i,
  );

  if (!match) {
    throw new HttpError(
      400,
      'mock_query_not_supported',
      'Mock datasource supports simple SELECT ... FROM ... [ORDER BY ...] [LIMIT ...] [OFFSET ...] queries only',
    );
  }

  const [, rawColumns, rawTable, orderBy, orderDirection, limit, offset] = match;
  const columns = rawColumns.trim() === '*'
    ? ['*']
    : rawColumns.split(',').map((column) => column.trim()).filter(Boolean);

  return {
    columns,
    table: normalizeFixtureTableName(rawTable),
    orderBy: orderBy || undefined,
    orderDirection: orderDirection || 'ASC',
    limit: limit ? Number.parseInt(limit, 10) : undefined,
    offset: offset ? Number.parseInt(offset, 10) : 0,
  };
}

function sortRows(rows, column, direction) {
  if (!column) {
    return [...rows];
  }

  const sorted = [...rows].sort((left, right) => {
    const leftValue = left[column];
    const rightValue = right[column];

    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue > rightValue ? 1 : -1;
  });

  return direction === 'DESC' ? sorted.reverse() : sorted;
}

function pickColumns(row, columns) {
  if (columns.length === 1 && columns[0] === '*') {
    return { ...row };
  }

  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}

export class MockSageClient {
  constructor(filePath) {
    this.filePath = filePath;
    this.fixtures = this.#loadFixtures(filePath);
  }

  #loadFixtures(filePath) {
    const resolvedPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new HttpError(500, 'mock_fixture_missing', `Mock data file not found: ${resolvedPath}`);
    }

    const raw = fs.readFileSync(resolvedPath, 'utf8');

    try {
      const parsed = JSON.parse(raw);
      const tables = parsed.tables || {};
      return Object.fromEntries(
        Object.entries(tables).map(([tableName, tableValue]) => [normalizeFixtureTableName(tableName), tableValue]),
      );
    } catch (error) {
      throw new HttpError(500, 'mock_fixture_invalid', 'Mock data file is not valid JSON', {
        cause: error instanceof Error ? error.message : 'unknown JSON parse error',
      });
    }
  }

  async healthcheck() {
    return { status: 'ok', mode: 'mock' };
  }

  async listTables() {
    return Object.keys(this.fixtures).map((tableName) => ({
      TABLE_NAME: tableName,
      TABLE_TYPE: 'TABLE',
      TABLE_CAT: 'MOCK',
      TABLE_SCHEM: null,
    }));
  }

  async describeTable(tableName) {
    const normalized = normalizeFixtureTableName(tableName);
    const table = this.fixtures[normalized];

    if (!table) {
      throw new HttpError(404, 'mock_table_missing', `Mock table ${normalized} was not found`);
    }

    return table.columns.map((column, index) => ({
      TABLE_NAME: normalized,
      COLUMN_NAME: column.name,
      TYPE_NAME: column.type,
      ORDINAL_POSITION: index + 1,
      NULLABLE: 1,
    }));
  }

  async query(sql) {
    const parsed = parseSelectQuery(sql);
    const table = this.fixtures[parsed.table];

    if (!table) {
      throw new HttpError(404, 'mock_table_missing', `Mock table ${parsed.table} was not found`);
    }

    const orderedRows = sortRows(table.rows, parsed.orderBy, parsed.orderDirection);
    const pagedRows = orderedRows.slice(parsed.offset, parsed.limit ? parsed.offset + parsed.limit : undefined);

    return {
      rows: pagedRows.map((row) => pickColumns(row, parsed.columns)),
    };
  }

  async close() {}
}
