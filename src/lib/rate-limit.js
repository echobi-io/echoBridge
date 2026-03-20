import { HttpError } from '../errors.js';

export class InMemoryRateLimiter {
  constructor({ maxRequests, windowMs }) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = new Map();
  }

  check(key) {
    const now = Date.now();
    const current = this.store.get(key);

    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + this.windowMs };
      this.store.set(key, next);
      return next;
    }

    current.count += 1;

    if (current.count > this.maxRequests) {
      throw new HttpError(429, 'rate_limited', 'Too many requests');
    }

    return current;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
