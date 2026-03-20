# Mock data quickstart

Use this guide when you want to run echoBridge **without** real Sage 50 / ODBC access.

## Fastest path

1. Copy `mock.env.example` to `.env`.
2. Start echoBridge.
3. Call the mock tables endpoint.

### Windows

```bat
copy mock.env.example .env
npm start
```

### PowerShell

```powershell
Copy-Item .\mock.env.example .\.env -Force
npm start
```

### macOS / Linux / WSL

```bash
cp mock.env.example .env
npm start
```

## One-command helper on Windows

This repo also includes a helper:

```bat
scripts\use-mock-data.bat
```

or:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\use-mock-data.ps1 -Force
```

That copies `mock.env.example` to `.env` for you.

## What mock mode does

With `DATA_SOURCE_MODE=mock`, echoBridge reads sample data from:

- `mock-data/sage-sample.json`

That means:

- `/v1/tables` returns the fake Sage tables,
- `/v1/tables/:table/schema` returns fake schema metadata,
- `/v1/tables/:table/rows` returns fixture rows,
- your Supabase Edge Function can be developed against the same API shape as production.

## Included mock tables

The bundled fixture contains these tables:

- `CUSTOMER`
- `SALES_LEDGER`
- `STOCK`

## Example local checks

Health:

```bash
curl http://127.0.0.1:8787/health
```

List tables with HMAC auth using the sample `mock.env.example` credentials:

```bash
node --input-type=module <<'EONODE'
import crypto from 'node:crypto';

const path = '/v1/tables';
const timestamp = Date.now().toString();
const bodyHash = crypto.createHash('sha256').update('').digest('hex');
const canonical = ['GET', path, timestamp, bodyHash].join('\n');
const signature = crypto.createHmac('sha256', 'super-secret-for-local-dev-only').update(canonical).digest('hex');

const response = await fetch(`http://127.0.0.1:8787${path}`, {
  headers: {
    'x-client-id': 'supabase-edge',
    'x-timestamp': timestamp,
    'x-signature': signature,
  },
});

console.log(await response.text());
EONODE
```

Then point your Supabase Edge Function at the mock-backed echoBridge URL until the real Sage / ODBC connection is available.

## Important note

Mock mode is for development, demos, and integration testing only.
Do not use the bundled sample data in production.
