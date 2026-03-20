import { HttpError } from '../errors.js';
import { ensureTableAllowed, normalizeColumnName, normalizeSortDirection } from './query-guards.js';

function normalizePositiveInteger(value, fieldName, defaultValue) {
  const candidate = value ?? defaultValue;
  const parsed = Number.parseInt(String(candidate), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_request', `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function normalizeNonNegativeInteger(value, fieldName, defaultValue) {
  const candidate = value ?? defaultValue;
  const parsed = Number.parseInt(String(candidate), 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, 'invalid_request', `${fieldName} must be zero or greater`);
  }

  return parsed;
}

export function buildTableReadQuery(request) {
  const table = ensureTableAllowed(request.table, request.allowedTables);
  const columns = request.columns && request.columns.length > 0
    ? request.columns.map((column) => normalizeColumnName(column)).join(', ')
    : '*';
  const limit = Math.min(
    normalizePositiveInteger(request.limit, 'limit', request.defaultLimit),
    request.maxLimit,
  );
  const offset = normalizeNonNegativeInteger(request.offset, 'offset', 0);

  let sql = `SELECT ${columns} FROM ${table}`;

  if (request.orderBy) {
    const direction = request.orderDirection ? normalizeSortDirection(request.orderDirection) : 'ASC';
    sql += ` ORDER BY ${normalizeColumnName(request.orderBy)} ${direction}`;
  }

  sql += ` LIMIT ${limit}`;

  if (offset > 0) {
    sql += ` OFFSET ${offset}`;
  }

  return { sql, limit, offset, table };
}
