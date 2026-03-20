# echoBridge

Production-focused Sage 50c connector that exposes allow-listed Sage tables over a hardened HTTP API. The service runs next to the Sage 50c ODBC driver and is designed to be called by Supabase Edge Functions for ingestion into Supabase.

## The easiest way to install it

If your Sage 50c machine is Windows, **yes: an installer script is the best approach**. Sage 50c ODBC deployments are usually Windows-hosted, and a PowerShell installer lets us automate the repetitive parts safely.

This repository now includes:

- `scripts/install.bat` - easiest double-click / command-line launcher for Windows.
- `scripts/install-windows.ps1` - the real installer that copies files, installs Node dependencies, creates `.env`, and can optionally register a Windows service.

### Recommended install flow for non-technical users

1. Copy this repository to the Windows machine that already has Sage 50c and the Sage ODBC driver installed.
2. Open Command Prompt **as Administrator**.
3. Change into the repository folder.
4. Run:

```bat
scripts\install.bat
```

The installer will:

- check that `node` and `npm` exist,
- ask you for the Sage ODBC connection string,
- ask which Sage tables Supabase should be allowed to read,
- generate a secure HMAC shared secret automatically,
- copy the app into `C:\Program Files\echoBridge`,
- run `npm install --omit=dev`,
- create the `.env` file for you,
- print the health URL and the auth values you need for Supabase.

If you want the installer to also register the app as a Windows service, run the PowerShell installer directly with `-RegisterService` after installing [NSSM](https://nssm.cc/).

## What the connector does

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

## Simple install guide

### Before you start

Make sure all of these are true on the Windows host:

- Sage 50c is installed.
- The Sage ODBC driver is installed.
- You know the correct DSN or ODBC connection string.
- Node.js 20 or newer is installed.
- You can open Command Prompt or PowerShell as Administrator.

### Step 1. Run the installer

Fastest option:

```bat
scripts\install.bat
```

Advanced / scripted option:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

Fully automated example with no prompts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 `
  -InstallDir 'C:\Program Files\echoBridge' `
  -HostName '127.0.0.1' `
  -Port 8787 `
  -OdbcConnectionString 'DSN=SageLine50v30;UID=manager;PWD=replace-me;' `
  -AllowedTables 'CUSTOMER,SALES_LEDGER,STOCK' `
  -AuthMode 'hmac' `
  -ClientId 'supabase-edge'
```

### Step 2. What the installer creates

By default, the installer will:

- copy the application into `C:\Program Files\echoBridge`,
- create `C:\Program Files\echoBridge\.env`,
- install production npm dependencies,
- leave you with a ready-to-run app.

### Step 3. Start the connector

If you did **not** use `-RegisterService`, start it manually:

```powershell
cd 'C:\Program Files\echoBridge'
npm start
```

If you want to install it as a Windows service and start it automatically on boot:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -RegisterService -Force
```

> `-RegisterService` requires NSSM to already be installed and available in your `PATH`.

### Step 4. Check that it works

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Readiness check:

```bash
curl http://127.0.0.1:8787/ready
```

If `/ready` fails, the app is running but cannot talk to Sage through ODBC yet. That usually means the DSN, username/password, or ODBC driver setup needs fixing.

## Installer options

The PowerShell installer supports these useful parameters:

- `-InstallDir` - where the app should be copied.
- `-ServiceName` - Windows service name when using `-RegisterService`.
- `-HostName` - bind address, usually `127.0.0.1`.
- `-Port` - HTTP port.
- `-AllowedTables` - comma-separated list of tables the API may expose.
- `-AuthMode` - `hmac` (recommended) or `api-key`.
- `-ClientId` - client ID for HMAC auth.
- `-SharedSecret` - optional; if omitted in HMAC mode the installer creates one automatically.
- `-ApiKey` - required only when `-AuthMode api-key` is used.
- `-OdbcConnectionString` - Sage DSN / connection string.
- `-RegisterService` - registers a Windows service with NSSM.
- `-Force` - overwrites an existing `.env` file.

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

Example row-read request:

```text
GET /v1/tables/CUSTOMER/rows?columns=ACCOUNT_REF,NAME&orderBy=ACCOUNT_REF&orderDirection=asc&limit=100&offset=0
```

## Supabase setup

### What values from the installer go into Supabase?

If you used HMAC mode, copy these values from the installer output into Supabase secrets:

- `SAGE_CONNECTOR_URL`
- `SAGE_CONNECTOR_CLIENT_ID`
- `SAGE_CONNECTOR_SHARED_SECRET`

If you used API key mode instead, store:

- `SAGE_CONNECTOR_URL`
- `SAGE_CONNECTOR_API_KEY`

### Example Supabase CLI commands

```bash
supabase secrets set \
  SAGE_CONNECTOR_URL=https://sage-connector.example.com \
  SAGE_CONNECTOR_CLIENT_ID=supabase-edge \
  SAGE_CONNECTOR_SHARED_SECRET=replace-with-your-secret

supabase functions deploy sage-proxy --no-verify-jwt
```

### Edge Function example

The repository includes `examples/supabase-edge/sage-proxy.ts`.
It:

- reads `table` and `limit` from the incoming request,
- signs the request with HMAC,
- calls `GET /v1/tables/:table/rows`,
- returns the JSON response.

## Security checklist

Before giving this to a client, verify all of the following:

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

## Files added for setup automation

- `scripts/install.bat`
- `scripts/install-windows.ps1`
- `.env.example`

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
