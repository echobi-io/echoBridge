# echoBridge installation prerequisites

This file lists the software and services you should have ready **before** you run the echoBridge installer.

## 1. Sage 50c / Sage 50 Accounts

You need a working Sage 50c (Sage 50 Accounts) installation on the Windows machine that will run echoBridge.

Official Sage links:

- Sage 50 Accounts product page: https://www.sage.com/en-gb/products/sage-50-cloud/
- Sage Help Centre: https://gb-kb.sage.com/
- Sage article covering version / ODBC compatibility notes: https://gb-kb.sage.com/portal/app/portlets/results/view2.jsp?k2dockey=230706142351603

Notes:

- In many Sage environments, the ODBC components come from the Sage 50 installation itself.
- If you need to download or reinstall Sage, use your Sage customer portal, trial download, or official Sage support/help route above.
- Before installing echoBridge, confirm you can open the Sage company data and that the DSN / ODBC connection string is known.

## 2. Sage ODBC access

echoBridge depends on the Sage ODBC driver being present and working on the same Windows machine.

Use these official Sage resources first:

- Sage Help Centre: https://gb-kb.sage.com/
- Sage 50 Accounts product/support entry point: https://www.sage.com/en-gb/products/sage-50-cloud/

Before continuing, verify:

- the correct Sage version is installed,
- the required ODBC driver is present,
- the DSN or connection string works,
- the Sage account used for access has the permissions you expect.

## 3. Node.js (required)

echoBridge runs on Node.js 20 or newer.

Official download page:

- Node.js download page: https://nodejs.org/en/download/

Recommended:

- install the latest LTS release available from the Node.js website,
- verify with `node --version` and `npm --version` after installation.

## 4. Supabase CLI (required for easy Edge Function deployment)

If you want to deploy the example Supabase Edge Function from this repository, install the Supabase CLI.

Official docs:

- Supabase CLI getting started: https://supabase.com/docs/guides/cli/getting-started
- Supabase Edge Functions quickstart: https://supabase.com/docs/guides/functions/quickstart

## 5. Deno editor tooling (optional but helpful)

Supabase Edge Functions run on Deno-compatible tooling. You do **not** need the separate Deno CLI just to deploy with the Supabase CLI, but it can help for editing, linting, and local tooling.

Official docs:

- Supabase Edge Functions development environment: https://supabase.com/docs/guides/functions/development-environment

## 6. NSSM (optional, only if you want echoBridge to run as a Windows service)

If you want the installer to register echoBridge as a Windows service with `-RegisterService`, install NSSM first.

Official links:

- NSSM homepage: https://nssm.cc/
- NSSM download page: https://nssm.cc/download

## 7. HTTPS endpoint / reverse proxy (required for Supabase cloud access)

Supabase Edge Functions run in Supabase's cloud, so they cannot call `http://127.0.0.1:8787` on your Sage server directly.
You must provide a reachable HTTPS endpoint in front of echoBridge.

Typical options:

- IIS reverse proxy
- nginx reverse proxy
- Caddy reverse proxy
- secure private tunnel / VPN approved by the client

## Quick checklist before you install

Make sure you have all of the following:

- [ ] Windows machine with Sage 50c installed
- [ ] Working Sage ODBC access / known DSN or connection string
- [ ] Node.js installed
- [ ] Supabase CLI installed (if deploying the example function)
- [ ] HTTPS endpoint plan for exposing echoBridge to Supabase
- [ ] NSSM installed if you want echoBridge as a Windows service


## Optional shortcut for development: mock mode

If you only want to test echoBridge or the Supabase integration and you do not have access to Sage 50 yet, you can skip the Sage prerequisites temporarily and run in mock mode using the bundled fixture file:

- `DATA_SOURCE_MODE=mock`
- `MOCK_DATA_FILE=mock-data/sage-sample.json`

Mock mode is for development/testing only; production should use the real Sage ODBC datasource.
