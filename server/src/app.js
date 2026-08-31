import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { env, isProd } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { UPLOAD_DIR } from './middleware/upload.js';

const app = express();

// Behind a proxy (Render, Railway, nginx) this is what makes rate limiting and
// req.ip see the real client address rather than the proxy's.
app.set('trust proxy', 1);

app.use(
  helmet({
    // Uploaded dish images are served from the API origin and rendered by the
    // frontend origin, which the default same-origin policy would block.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: isProd ? env.clientUrl : true,
    credentials: true,
  }),
);

/**
 * The payment webhook must be verified against the EXACT bytes Razorpay signed,
 * so it is captured as a raw Buffer BEFORE the JSON parser runs. express.raw
 * marks the body as already parsed, so express.json() below skips this path.
 * Re-serialising parsed JSON would change key order or spacing and the HMAC
 * would never match.
 */
app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '256kb' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.use('/api', apiLimiter, routes);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Smart Restaurant API',
    docs: '/api/health',
  });
});

// Optionally serve the built React app from the same process in production.
if (isProd && process.env.SERVE_CLIENT === 'true') {
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
