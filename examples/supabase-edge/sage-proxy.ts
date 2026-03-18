interface Env {
  SAGE_CONNECTOR_URL: string;
  SAGE_CONNECTOR_API_KEY: string;
}

Deno.serve(async (request) => {
  const env = Deno.env.toObject() as unknown as Env;
  const url = new URL(request.url);
  const table = url.searchParams.get('table') ?? 'CUSTOMER';
  const limit = url.searchParams.get('limit') ?? '25';

  const connectorUrl = new URL(`/tables/${table}/rows?limit=${encodeURIComponent(limit)}`, env.SAGE_CONNECTOR_URL);
  const response = await fetch(connectorUrl, {
    headers: {
      'x-api-key': env.SAGE_CONNECTOR_API_KEY,
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
