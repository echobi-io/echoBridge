interface Env {
  SAGE_CONNECTOR_URL: string;
  SAGE_CONNECTOR_AUTH_MODE?: 'hmac' | 'api-key';
  SAGE_CONNECTOR_CLIENT_ID?: string;
  SAGE_CONNECTOR_SHARED_SECRET?: string;
  SAGE_CONNECTOR_API_KEY?: string;
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

async function buildAuthHeaders(env: Env, method: string, pathWithQuery: string, body: string): Promise<Record<string, string>> {
  const authMode = env.SAGE_CONNECTOR_AUTH_MODE ?? 'hmac';

  if (authMode === 'api-key') {
    if (!env.SAGE_CONNECTOR_API_KEY) {
      throw new Error('SAGE_CONNECTOR_API_KEY is required when SAGE_CONNECTOR_AUTH_MODE=api-key');
    }

    return {
      'x-api-key': env.SAGE_CONNECTOR_API_KEY,
    };
  }

  if (!env.SAGE_CONNECTOR_CLIENT_ID || !env.SAGE_CONNECTOR_SHARED_SECRET) {
    throw new Error('SAGE_CONNECTOR_CLIENT_ID and SAGE_CONNECTOR_SHARED_SECRET are required when using HMAC auth');
  }

  const timestamp = Date.now().toString();
  const signature = await signRequest(method, pathWithQuery, timestamp, body, env.SAGE_CONNECTOR_SHARED_SECRET);

  return {
    'x-client-id': env.SAGE_CONNECTOR_CLIENT_ID,
    'x-timestamp': timestamp,
    'x-signature': signature,
  };
}

function buildConnectorPath(requestUrl: URL): string {
  const action = requestUrl.searchParams.get('action') ?? 'rows';
  const table = requestUrl.searchParams.get('table') ?? 'CUSTOMER';

  if (action === 'metadata') {
    return '/v1/metadata';
  }

  if (action === 'tables') {
    return '/v1/tables';
  }

  if (action === 'schema') {
    return `/v1/tables/${encodeURIComponent(table)}/schema`;
  }

  const connectorPath = new URL(`/v1/tables/${encodeURIComponent(table)}/rows`, 'https://placeholder.local');
  for (const key of ['columns', 'limit', 'offset', 'orderBy', 'orderDirection']) {
    const value = requestUrl.searchParams.get(key);
    if (value) {
      connectorPath.searchParams.set(key, value);
    }
  }

  return `${connectorPath.pathname}${connectorPath.search}`;
}

Deno.serve(async (request) => {
  try {
    const env = Deno.env.toObject() as unknown as Env;
    const requestUrl = new URL(request.url);
    const connectorPath = buildConnectorPath(requestUrl);
    const connectorUrl = new URL(connectorPath, env.SAGE_CONNECTOR_URL);
    const method = 'GET';
    const body = '';
    const authHeaders = await buildAuthHeaders(env, method, connectorPath, body);

    const response = await fetch(connectorUrl, {
      method,
      headers: {
        ...authHeaders,
      },
    });

    const payload = await response.text();

    return new Response(payload, {
      status: response.status,
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : 'Unexpected error',
        },
        null,
        2,
      ),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  }
});
