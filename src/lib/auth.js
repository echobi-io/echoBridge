import crypto from 'node:crypto';
import { HttpError } from '../errors.js';

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signRequest({ method, pathname, timestamp, body = '', secret }) {
  const bodyHash = sha256Hex(body);
  const canonical = [method.toUpperCase(), pathname, timestamp, bodyHash].join('\n');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

function assertFreshTimestamp(timestampHeader, maxSkewMs) {
  if (!/^\d+$/.test(timestampHeader || '')) {
    throw new HttpError(401, 'invalid_auth', 'x-timestamp must be a unix epoch in milliseconds');
  }

  const timestamp = Number.parseInt(timestampHeader, 10);
  const drift = Math.abs(Date.now() - timestamp);

  if (drift > maxSkewMs) {
    throw new HttpError(401, 'stale_request', 'The signed request timestamp is outside the allowed clock skew window');
  }
}

export function authenticateRequest({ config, headers, method, pathname, rawBody }) {
  if (config.authMode === 'api-key') {
    if (!timingSafeEqualText(String(headers['x-api-key'] || ''), config.apiKey)) {
      throw new HttpError(401, 'invalid_auth', 'Missing or invalid x-api-key header');
    }

    return { type: 'api-key' };
  }

  const clientId = String(headers['x-client-id'] || '');
  const timestamp = String(headers['x-timestamp'] || '');
  const signature = String(headers['x-signature'] || '');

  if (!clientId || !timestamp || !signature) {
    throw new HttpError(401, 'invalid_auth', 'Missing x-client-id, x-timestamp, or x-signature header');
  }

  if (clientId !== config.clientId) {
    throw new HttpError(401, 'invalid_auth', 'Unknown client id');
  }

  assertFreshTimestamp(timestamp, config.allowedClockSkewMs);

  const expectedSignature = signRequest({
    method,
    pathname,
    timestamp,
    body: rawBody,
    secret: config.sharedSecret,
  });

  if (!timingSafeEqualText(signature, expectedSignature)) {
    throw new HttpError(401, 'invalid_auth', 'Request signature validation failed');
  }

  return { type: 'hmac', clientId };
}
