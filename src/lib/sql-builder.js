import { ensureTableAllowed, normalizeColumnName, normalizeSortDirection } from './query-guards.js';

export function buildTableReadQuery(request) {
  const table = ensureTableAllowed(request.table, request.allowedTables);
  const columns = request.columns && request.columns.length > 0
    ? request.columns.map((column) => normalizeColumnName(column)).join(', ')
    : '*';
  const limit = Math.min(request.limit, request.maxLimit);

  if (limit <= 0) {
    throw new Error('limit must be greater than zero');
  }

  const offset = request.offset ?? 0;

  if (offset < 0) {
    throw new Error('offset must be zero or greater');
  }

  let sql = `SELECT ${columns} FROM ${table}`;

  if (request.orderBy) {
    const direction = request.orderDirection ? normalizeSortDirection(request.orderDirection) : 'ASC';
    sql += ` ORDER BY ${normalizeColumnName(request.orderBy)} ${direction}`;
  }

  sql += ` LIMIT ${limit}`;

  if (offset > 0) {
    sql += ` OFFSET ${offset}`;
  }

  return { sql };
}
