# echoBridge

A lightweight Sage 50c connector that uses ODBC to expose Sage tables through a small HTTP API, so Supabase Edge Functions can fetch accounting data without talking to ODBC directly.

## What this connector does

- Connects to a Sage 50c ODBC data source using a standard ODBC connection string.
- Exposes metadata endpoints for listing tables and inspecting schemas.
- Exposes row-reading endpoints for approved tables.
- Exposes a guarded read-only SQL endpoint for custom `SELECT` queries.
- Uses an API key so Supabase Edge Functions can authenticate to the connector.

## API endpoints

### `GET /health`
Returns a simple health response.

### `GET /tables`
Returns the visible ODBC tables and the configured allow-list.

### `GET /tables/:table/schema`
Returns the ODBC column metadata for an allow-listed table.

### `GET /tables/:table/rows`
Reads rows from an allow-listed table.

Query parameters:

- `columns=ACCOUNT_REF,NAME`
- `limit=100`
- `offset=0`
- `orderBy=ACCOUNT_REF`
- `orderDirection=asc`

### `POST /query`
Runs a read-only `SELECT` statement after validating the SQL for dangerous tokens.

```json
{
  "sql": "SELECT ACCOUNT_REF, NAME FROM CUSTOMER LIMIT 25"
}
```

## Configuration

Copy `.env.example` to `.env` and update the values:

- `SAGE_ODBC_CONNECTION_STRING`: ODBC DSN or full connection string for Sage 50c.
- `SAGE_ALLOWED_TABLES`: comma-separated allow-list of Sage tables exposed to the API.
- `API_KEY`: shared secret used by callers.
- `SAGE_DEFAULT_LIMIT`: default row limit for table reads.
- `SAGE_MAX_LIMIT`: hard maximum row limit.

## Development

Install dependencies and run the connector:

```bash
npm install
npm start
```

Run tests:

```bash
npm test
```

> The runtime ODBC dependency is loaded lazily. If the `odbc` package is missing, the service will return an explicit error telling you to run `npm install` on the host that has the Sage 50c ODBC driver available.

## Supabase Edge Function example

An example edge function is included at `examples/supabase-edge/sage-proxy.ts`.
It forwards requests to the connector with the shared API key and returns the JSON response.

## Deployment notes

- Run this connector close to the Sage 50c ODBC driver, usually on the same Windows host or a server with the Sage ODBC driver installed.
- Supabase Edge Functions should call this service over HTTPS.
- Keep the table allow-list narrow and prefer `/tables/:table/rows` over unrestricted SQL where possible.
