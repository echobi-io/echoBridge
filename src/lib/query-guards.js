import { HttpError } from '../errors.js';

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sortableDirections = new Set(['asc', 'desc']);
const forbiddenSqlTokens = [
  ';',
  '--',
  '/*',
  '*/',
  ' INSERT ',
  ' UPDATE ',
  ' DELETE ',
  ' DROP ',
  ' ALTER ',
  ' CREATE ',
  ' TRUNCATE ',
  ' EXEC ',
  ' MERGE ',
  ' CALL ',
  ' GRANT ',
  ' REVOKE ',
  ' INTO OUTFILE ',
  ' LOAD_FILE ',
];

export function normalizeTableName(table) {
  const normalized = String(table || '').trim().toUpperCase();

  if (!identifierPattern.test(normalized)) {
    throw new HttpError(400, 'invalid_table', `Invalid table name: ${table}`);
  }

  return normalized;
}

export function normalizeColumnName(column) {
  const normalized = String(column || '').trim();

  if (!identifierPattern.test(normalized)) {
    throw new HttpError(400, 'invalid_column', `Invalid column name: ${column}`);
  }

  return normalized;
}

export function normalizeSortDirection(direction) {
  const normalized = String(direction || '').trim().toLowerCase();

  if (!sortableDirections.has(normalized)) {
    throw new HttpError(400, 'invalid_sort_direction', `Invalid sort direction: ${direction}`);
  }

  return normalized.toUpperCase();
}

export function assertReadOnlySql(sql) {
  const trimmed = String(sql || '').trim();
  const normalized = trimmed.replace(/\s+/g, ' ').toUpperCase();

  if (!normalized.startsWith('SELECT ')) {
    throw new HttpError(400, 'invalid_sql', 'Only SELECT statements are allowed');
  }

  for (const token of forbiddenSqlTokens) {
    if (normalized.includes(token)) {
      throw new HttpError(400, 'invalid_sql', `Forbidden SQL token detected: ${token.trim()}`);
    }
  }

  return trimmed;
}

export function ensureTableAllowed(table, allowedTables) {
  const normalized = normalizeTableName(table);

  if (allowedTables.length > 0 && !allowedTables.includes(normalized)) {
    throw new HttpError(403, 'table_forbidden', `Table ${normalized} is not in the SAGE_ALLOWED_TABLES allow-list`);
  }

  return normalized;
}

export function parseColumnList(columnList) {
  if (!columnList) {
    return undefined;
  }

  const columns = String(columnList)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeColumnName(value));

  return columns.length > 0 ? columns : undefined;
}
