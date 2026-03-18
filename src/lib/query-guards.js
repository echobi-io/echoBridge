const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sortableDirections = new Set(['asc', 'desc']);

export function normalizeTableName(table) {
  const normalized = table.trim().toUpperCase();

  if (!identifierPattern.test(normalized)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  return normalized;
}

export function normalizeColumnName(column) {
  const normalized = column.trim();

  if (!identifierPattern.test(normalized)) {
    throw new Error(`Invalid column name: ${column}`);
  }

  return normalized;
}

export function normalizeSortDirection(direction) {
  const normalized = direction.trim().toLowerCase();

  if (!sortableDirections.has(normalized)) {
    throw new Error(`Invalid sort direction: ${direction}`);
  }

  return normalized.toUpperCase();
}

export function assertReadOnlySql(sql) {
  const trimmed = sql.trim();
  const normalized = trimmed.replace(/\s+/g, ' ').toUpperCase();

  if (!normalized.startsWith('SELECT ')) {
    throw new Error('Only SELECT statements are allowed');
  }

  const forbiddenTokens = [
    ';',
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
  ];

  for (const token of forbiddenTokens) {
    if (normalized.includes(token)) {
      throw new Error(`Forbidden SQL token detected: ${token.trim()}`);
    }
  }

  return trimmed;
}

export function ensureTableAllowed(table, allowedTables) {
  const normalized = normalizeTableName(table);

  if (allowedTables.length > 0 && !allowedTables.includes(normalized)) {
    throw new Error(`Table ${normalized} is not in the SAGE_ALLOWED_TABLES allow-list`);
  }

  return normalized;
}
