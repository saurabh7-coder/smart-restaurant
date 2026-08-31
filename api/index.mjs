/**
 * Vercel serverless entry point.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * `server/src/server.js` is written for a long-running process: it connects to
 * Mongo once at boot, prints a banner, calls `app.listen`, and — critically —
 * `process.exit(1)` if the database is unreachable. All three are wrong here.
 * A serverless function is invoked per request, must not bind a port, and must
 * never exit the process on a transient connection failure, because that takes
 * down the container serving every other request.
 *
 * So this wraps the same Express app with the two things serverless needs:
 * a connection cached across invocations, and failures returned as HTTP errors.
 */
import app from '../server/src/app.js';
import { connectDB } from '../server/src/config/db.js';

/*
 * Vercel keeps a warm container between requests, so the connection is cached
 * on globalThis rather than in a module variable — module state is not reliably
 * shared, but the global object survives for the container's lifetime. Caching
 * the *promise* (not the resolved value) means concurrent cold-start requests
 * await one connection attempt instead of each opening their own.
 */
const cache = globalThis.__mongo ?? (globalThis.__mongo = { promise: null });

async function ready() {
  if (!cache.promise) {
    cache.promise = connectDB().catch((err) => {
      // Clear the cache so the next request retries rather than being stuck
      // with a permanently rejected promise.
      cache.promise = null;
      throw err;
    });
  }
  return cache.promise;
}

export default async function handler(req, res) {
  try {
    await ready();
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    return res.end(
      JSON.stringify({
        success: false,
        message: 'The database is unavailable. Please try again in a moment.',
        detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
      }),
    );
  }
  return app(req, res);
}
