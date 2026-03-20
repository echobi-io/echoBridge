# echoBridge

Production-focused Sage 50c connector that exposes allow-listed Sage tables over a hardened HTTP API. The service runs next to the Sage 50c ODBC driver and is designed to be called by Supabase Edge Functions for ingestion into Supabase.

## Features

- Connects to Sage 50c through ODBC on the local Windows host or another machine with the Sage ODBC driver installed.
- Uses versioned API routes under `/v1`.
- Defaults to HMAC request signing instead of a static API key.
- Enforces table allow-listing, bounded pagination, body-size limits, request timeouts, and in-memory rate limiting.
- Disables arbitrary SQL by default; custom SQL can be enabled explicitly.
- Exposes health and readiness endpoints for deployment monitoring.
- Includes a Supabase Edge Function example that signs requests correctly.

## Architecture

```text
Supabase Edge Function -> HTTPS reverse proxy / firewall -> echoBridge -> Sage 50c ODBC DSN
```

Recommended deployment model:

1. Install `echoBridge` on the same Windows server as Sage 50c or on a server that already has the Sage ODBC driver and DSN configured.
2. Bind `echoBridge` to a private interface only.
3. Put IIS, nginx, Caddy, or another TLS-terminating reverse proxy in front of the service.
4. Allow inbound traffic only from your proxy or private network.
5. Let Supabase Edge Functions call the reverse proxy over HTTPS using HMAC authentication.

## API routes

### Unauthenticated

- `GET /health` - process health only.
- `GET /ready` - verifies the connector can execute a trivial ODBC query.

### Authenticated `/v1` routes

- `GET /v1/metadata` - connector configuration and limits, excluding secrets.
- `GET /v1/tables` - list visible ODBC tables.
- `GET /v1/tables/:table/schema` - list column metadata for an allow-listed table.
- `GET /v1/tables/:table/rows` - return rows from an allow-listed table.
- `POST /v1/query` - disabled by default; only enabled when `ENABLE_SQL_ENDPOINT=true`.

### Example row-read request

`GET /v1/tables/CUSTOMER/rows?columns=ACCOUNT_REF,NAME&orderBy=ACCOUNT_REF&orderDirection=asc&limit=100&offset=0`

## Authentication

### Recommended: HMAC signing

Set:

- `AUTH_MODE=hmac`
- `CONNECTOR_CLIENT_ID=<shared logical client id>`
- `CONNECTOR_SHARED_SECRET=<long random secret>`

For every authenticated request, the caller must send:

- `x-client-id`
- `x-timestamp` as unix epoch milliseconds
- `x-signature`

The signature is:

```text
hex(HMAC_SHA256(secret, METHOD + "\n" + PATH_WITH_QUERY + "\n" + TIMESTAMP + "\n" + SHA256_HEX(BODY)))
```

Requests outside the configured clock-skew window are rejected.

### Fallback: API key

If you need a simpler integration temporarily, set `AUTH_MODE=api-key` and provide `API_KEY`. Then callers send `x-api-key`.

## Install and setup

### 1. Prepare the Sage host

On the Windows machine that has Sage 50c installed:

1. Confirm Sage 50c is installed and the relevant company data is accessible.
2. Install or verify the Sage ODBC driver that matches your Sage 50c version.
3. Create or verify a DSN for the company dataset.
4. Confirm the DSN works from the host before deploying `echoBridge`.
5. Create a dedicated least-privilege Sage/ODBC account if your environment supports it.

### 2. Install Node.js

Install Node.js 20.x or newer on the connector host.

Verify:

```bash
node --version
npm --version
```

### 3. Deploy the application files

Copy the repository to the connector host and install dependencies:

```bash
npm install --omit=dev
```

> The `odbc` package must be installed on the same host that has access to the Sage ODBC driver.

### 4. Create the runtime configuration

Copy `.env.example` to `.env`.

Example production configuration:

```dotenv
SERVICE_NAME=echoBridge
NODE_ENV=production
PORT=8787
HOST=127.0.0.1
SAGE_ODBC_CONNECTION_STRING=DSN=SageLine50v28;UID=manager;PWD=replace-me;
SAGE_ALLOWED_TABLES=CUSTOMER,SALES_LEDGER,STOCK
SAGE_DEFAULT_LIMIT=250
SAGE_MAX_LIMIT=1000
AUTH_MODE=hmac
CONNECTOR_CLIENT_ID=supabase-edge
CONNECTOR_SHARED_SECRET=replace-with-a-long-random-secret
ALLOWED_CLOCK_SKEW_MS=300000
BODY_LIMIT_BYTES=32768
REQUEST_TIMEOUT_MS=30000
ENABLE_SQL_ENDPOINT=false
LOG_QUERY_TEXT=false
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
TRUST_PROXY=true
```

Important recommendations:

- Bind to `127.0.0.1` or a private network interface.
- Keep `ENABLE_SQL_ENDPOINT=false` unless you absolutely need custom SQL.
- Keep `LOG_QUERY_TEXT=false` in production to avoid logging sensitive accounting queries.
- Only allow the exact Sage tables Supabase needs.
- Rotate `CONNECTOR_SHARED_SECRET` regularly.

### 5. Start the service

For a simple foreground run:

```bash
npm start
```

For production, run the connector as a managed service. On Windows, common options are:

- NSSM
- Windows Service Wrapper
- PM2
- Task Scheduler for simple restart-on-boot scenarios

The service reads `.env` automatically at startup.

### 5a. Optional: register as a Windows service with NSSM

Example using [NSSM](https://nssm.cc/):

1. Install NSSM on the connector host.
2. Open an elevated prompt.
3. Register the service:

```powershell
nssm install echoBridge "C:\Program Files\nodejs\node.exe" "C:\path\to\echoBridge\src\server.js"
nssm set echoBridge AppDirectory "C:\path\to\echoBridge"
nssm set echoBridge DisplayName "echoBridge Sage Connector"
nssm set echoBridge Start SERVICE_AUTO_START
```

4. Confirm the service account can read the `.env` file and reach the Sage DSN.
5. Start the service and verify `http://127.0.0.1:8787/health`.

### 6. Put TLS in front of the connector

Do not expose the raw Node server directly to the internet.

Recommended reverse proxy requirements:

- HTTPS only
- IP allow-list or private network restriction
- Request size limits
- Access logs enabled
- Optional mutual TLS if the client requires it

### 7. Validate the connector locally

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Readiness check:

```bash
curl http://127.0.0.1:8787/ready
```

Metadata check with HMAC signing should be performed from your Supabase function or a trusted script using the shared secret.

## Signed request example

You can verify HMAC authentication from a trusted machine with a short Node script:

```bash
node --input-type=module <<'EOF'
import crypto from 'node:crypto';

const secret = process.env.CONNECTOR_SHARED_SECRET;
const clientId = process.env.CONNECTOR_CLIENT_ID;
const path = '/v1/metadata';
const timestamp = Date.now().toString();
const bodyHash = crypto.createHash('sha256').update('').digest('hex');
const canonical = ['GET', path, timestamp, bodyHash].join('\n');
const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

const response = await fetch(`http://127.0.0.1:8787${path}`, {
  headers: {
    'x-client-id': clientId,
    'x-timestamp': timestamp,
    'x-signature': signature,
  },
});

console.log(await response.text());
EOF
```

## Supabase setup

### 1. Configure Edge Function secrets

In Supabase, set these secrets for the Edge Function:

- `SAGE_CONNECTOR_URL`
- `SAGE_CONNECTOR_CLIENT_ID`
- `SAGE_CONNECTOR_SHARED_SECRET`

### 2a. Example Supabase CLI commands

```bash
supabase secrets set \
  SAGE_CONNECTOR_URL=https://sage-connector.example.com \
  SAGE_CONNECTOR_CLIENT_ID=supabase-edge \
  SAGE_CONNECTOR_SHARED_SECRET=replace-with-your-secret

supabase functions deploy sage-proxy --no-verify-jwt
```

If you want the function callable only by your backend, keep Supabase auth or your own gateway in front of the edge function as well.

### 2. Deploy the example function

The repository includes `examples/supabase-edge/sage-proxy.ts`. Adapt it to your ingestion workflow, then deploy it using the Supabase CLI.

The function currently:

- Reads `table` and `limit` from the request query string.
- Signs the request with HMAC.
- Calls `GET /v1/tables/:table/rows` on `echoBridge`.
- Returns the upstream JSON payload.

### 3. Ingest into Supabase tables

A common pattern is:

1. Call `echoBridge` from an Edge Function.
2. Transform Sage rows into your Supabase shape.
3. Upsert into Supabase using the service role key or a Postgres function.
4. Store sync checkpoints in a metadata table.

## Security checklist

Before client deployment, verify all of the following:

- The connector host is patched and access is restricted.
- The Sage DSN is tested and uses the minimum access required.
- `HOST` is not set to a public interface unless protected by a reverse proxy and firewall.
- TLS termination is configured.
- HMAC auth is enabled.
- `ENABLE_SQL_ENDPOINT=false` unless explicitly approved.
- `SAGE_ALLOWED_TABLES` contains only the required tables.
- Secrets are stored in a secret manager or protected `.env` file with restricted permissions.
- Monitoring is in place for `/health`, `/ready`, and proxy logs.
- Secret rotation and incident response procedures are documented.

## Development and testing

Run tests:

```bash
npm test
```

Start locally:

```bash
npm start
```

## Notes and limitations

- This service assumes the host has working network access to Sage 50c data through the configured ODBC driver.
- The included rate limiter is in-memory. If you run multiple connector instances, enforce rate limits at the reverse proxy or load balancer too.
- `POST /v1/query` is intentionally disabled by default because arbitrary SQL increases risk.
- ODBC SQL dialect support varies by Sage driver version; validate table names and syntax against your specific Sage 50c installation.
