/**
 * Deployment diagnostic. Reports which env vars the live function can see
 * (presence only, never values) and whether the main app imports cleanly —
 * so a failure shows its actual error message instead of Vercel's opaque
 * FUNCTION_INVOCATION_FAILED page.
 */
export default async function handler(req, res) {
  const out = {
    node: process.version,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    env: {
      MONGO_URI: Boolean(process.env.MONGO_URI),
      JWT_SECRET: Boolean(process.env.JWT_SECRET),
      CLIENT_URL: process.env.CLIENT_URL || null,
      NODE_ENV: process.env.NODE_ENV || null,
    },
  };
  try {
    await import('../server/src/app.js');
    out.appImport = 'ok';
  } catch (err) {
    out.appImport = `FAILED: ${err.message}`;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 2));
}
