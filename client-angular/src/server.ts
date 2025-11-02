import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Thêm middleware cho Content-Security-Policy
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Allow scripts from self, inline, eval (for Angular JIT in dev), and Tailwind's CDN.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
      // Allow styles from self, inline, Google Fonts, and Font-Awesome.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      // Allow fonts from self, Google Fonts, and Font-Awesome.
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      // Allow images from various sources including Cloudinary, Giphy, and data URIs.
      "img-src 'self' data: https: http://localhost:5000 https://res.cloudinary.com https://media.giphy.com",
      // **THIS IS THE KEY FIX**: Explicitly allow media (audio/video) from Cloudinary.
      "media-src 'self' https://res.cloudinary.com",
      // Allow connections for API calls, WebSockets, and external services like Giphy.
      "connect-src 'self' http://localhost:5000 ws://localhost:5000 wss://stream.binance.com https://api.giphy.com https://res.cloudinary.com",
    ].join('; ')
  );
  next();
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
