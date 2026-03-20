# Supabase Edge Function setup

This folder contains a working proxy example for calling echoBridge from Supabase Edge Functions.

## Important network requirement

Supabase Edge Functions run in Supabase's cloud, not on your Sage server.
That means `SAGE_CONNECTOR_URL` must be a URL the edge function can actually reach over HTTPS.

Typical options are:

- a public HTTPS reverse proxy in front of echoBridge,
- a private network path exposed through a secure tunnel or VPN,
- a client-managed private connectivity solution.

If `echoBridge` only listens on `127.0.0.1` on the Sage host and is not published through a reachable HTTPS endpoint, the edge function will not be able to connect.

## Required Supabase secrets

For HMAC mode:

- `SAGE_CONNECTOR_URL`
- `SAGE_CONNECTOR_AUTH_MODE=hmac`
- `SAGE_CONNECTOR_CLIENT_ID`
- `SAGE_CONNECTOR_SHARED_SECRET`

For API key mode:

- `SAGE_CONNECTOR_URL`
- `SAGE_CONNECTOR_AUTH_MODE=api-key`
- `SAGE_CONNECTOR_API_KEY`

## Deploy

```bash
supabase secrets set \
  SAGE_CONNECTOR_URL=https://sage-connector.example.com \
  SAGE_CONNECTOR_AUTH_MODE=hmac \
  SAGE_CONNECTOR_CLIENT_ID=supabase-edge \
  SAGE_CONNECTOR_SHARED_SECRET=replace-with-your-secret

supabase functions deploy sage-proxy --no-verify-jwt
```

## Call the function

Fetch rows from a Sage table:

```bash
curl "https://<project-ref>.functions.supabase.co/sage-proxy?action=rows&table=CUSTOMER&limit=100"
```

List visible tables:

```bash
curl "https://<project-ref>.functions.supabase.co/sage-proxy?action=tables"
```

Inspect a schema:

```bash
curl "https://<project-ref>.functions.supabase.co/sage-proxy?action=schema&table=CUSTOMER"
```

Read connector metadata:

```bash
curl "https://<project-ref>.functions.supabase.co/sage-proxy?action=metadata"
```
