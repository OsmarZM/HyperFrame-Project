import http from 'http';
import path from 'path';
import fs from 'fs';
import serveHandler from 'serve-handler';

export interface SceneSource {
  /** The URL that Puppeteer should navigate to */
  url: string;
  /** Call this to stop the local file server (if one was started) */
  cleanup: () => Promise<void>;
}

/**
 * Resolve a scene input (URL string or local folder/file path) into a URL
 * that Puppeteer can navigate to. If the input is a local path, an ephemeral
 * HTTP server is started so that relative assets, fonts, and CORS policies
 * work correctly.
 */
export async function loadScene(input: string): Promise<SceneSource> {
  // Remote URL — use as-is
  if (/^https?:\/\//i.test(input)) {
    return { url: input, cleanup: async () => {} };
  }

  const resolved = path.resolve(input);

  // Check the path exists
  if (!fs.existsSync(resolved)) {
    throw new Error(`Scene input not found: ${resolved}`);
  }

  // If a file was provided, use its parent directory as the root
  const stat = fs.statSync(resolved);
  const root = stat.isDirectory() ? resolved : path.dirname(resolved);
  const entryFile = stat.isDirectory() ? 'index.html' : path.basename(resolved);

  // Verify the entry file exists
  const entryPath = path.join(root, entryFile);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Entry file not found: ${entryPath}`);
  }

  // Start an ephemeral HTTP server on a random port
  const server = http.createServer((req, res) => {
    serveHandler(req, res, {
      public: root,
      directoryListing: false,
      headers: [
        {
          source: '**/*',
          headers: [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
            { key: 'Cache-Control', value: 'no-store' },
          ],
        },
      ],
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server port'));
        return;
      }
      resolve(addr.port);
    });
    server.on('error', reject);
  });

  const url = `http://127.0.0.1:${port}/${entryFile}`;

  const cleanup = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { url, cleanup };
}
