interface Env {
  SAGE_CONNECTOR_URL: string;
  SAGE_CONNECTOR_CLIENT_ID: string;
  SAGE_CONNECTOR_SHARED_SECRET: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function signRequest(method: string, pathWithQuery: string, timestamp: string, body: string, secret: string): Promise<string> {
  const bodyHash = await sha256Hex(body);
  const canonical = `${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (request) => {
  const env = Deno.env.toObject() as unknown as Env;
  const url = new URL(request.url);
  const table = url.searchParams.get('table') ?? 'CUSTOMER';
  const limit = url.searchParams.get('limit') ?? '100';
  const connectorPath = `/v1/tables/${encodeURIComponent(table)}/rows?limit=${encodeURIComponent(limit)}`;
  const connectorUrl = new URL(connectorPath, env.SAGE_CONNECTOR_URL);
  const timestamp = Date.now().toString();
  const signature = await signRequest('GET', connectorPath, timestamp, '', env.SAGE_CONNECTOR_SHARED_SECRET);

  const response = await fetch(connectorUrl, {
    headers: {
      'x-client-id': env.SAGE_CONNECTOR_CLIENT_ID,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
  });

  const payload = await response.json();

  return new Response(JSON.stringify(payload, null, 2), {
    status: response.status,
    headers: {
      'content-type': 'application/json',
    },
  });
});
