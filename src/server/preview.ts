import http from 'http';
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import serveHandler from 'serve-handler';
import { loadScene } from '../core/scene-loader';

export interface PreviewOptions {
  input: string;
  port: number;
}

const OVERLAY_SCRIPT = `
<style id="__hf_overlay_style">
  #__hf_overlay {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 999999;
    background: rgba(10,10,10,0.88);
    color: #eee;
    font: 13px/1 'Segoe UI', system-ui, sans-serif;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    user-select: none;
    backdrop-filter: blur(8px);
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  #__hf_overlay button {
    background: #333; border: 1px solid #555; color: #eee;
    padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
  }
  #__hf_overlay button:hover { background: #444; }
  #__hf_overlay input[type=range] { flex: 1; accent-color: #7c6af7; }
  #__hf_frame_counter { min-width: 80px; text-align: right; font-size: 12px; color: #aaa; }
</style>
<div id="__hf_overlay">
  <button id="__hf_play">▶ Play</button>
  <input type="range" id="__hf_slider" min="0" value="0" step="1">
  <span id="__hf_frame_counter">0 / 0</span>
  <button id="__hf_render_btn" style="background:#5c3af7;border-color:#7c6af7">⬛ Render MP4</button>
</div>
<script>
(function() {
  const meta = window.hyperframe || {};
  const fps = meta.fps || 30;
  const total = meta.durationInFrames || 150;
  const slider = document.getElementById('__hf_slider');
  const counter = document.getElementById('__hf_frame_counter');
  const playBtn = document.getElementById('__hf_play');
  const renderBtn = document.getElementById('__hf_render_btn');

  slider.max = total - 1;
  counter.textContent = '0 / ' + total;

  let playing = false;
  let currentFrame = 0;
  let lastTime = null;
  let rafId = null;

  function goToFrame(f) {
    currentFrame = Math.max(0, Math.min(f, total - 1));
    slider.value = currentFrame;
    counter.textContent = currentFrame + ' / ' + total;
    if (typeof window.setFrame === 'function') {
      const r = window.setFrame(currentFrame);
      return r instanceof Promise ? r : Promise.resolve();
    }
    return Promise.resolve();
  }

  function tick(ts) {
    if (!playing) return;
    if (lastTime == null) lastTime = ts;
    const delta = ts - lastTime;
    if (delta >= 1000 / fps) {
      lastTime = ts;
      currentFrame++;
      if (currentFrame >= total) {
        currentFrame = 0;
        playing = false;
        playBtn.textContent = '▶ Play';
        goToFrame(currentFrame);
        return;
      }
      goToFrame(currentFrame);
    }
    rafId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
    if (playing) { lastTime = null; rafId = requestAnimationFrame(tick); }
    else if (rafId) cancelAnimationFrame(rafId);
  });

  slider.addEventListener('input', () => {
    if (playing) { playing = false; playBtn.textContent = '▶ Play'; }
    goToFrame(parseInt(slider.value));
  });

  renderBtn.addEventListener('click', () => {
    const config = encodeURIComponent(JSON.stringify(meta));
    renderBtn.textContent = '⏳ Submitted…';
    renderBtn.disabled = true;
    fetch('/__hf_render', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ config: meta }) })
      .then(r => r.json())
      .then(d => {
        renderBtn.textContent = '✓ Job ' + d.id;
        renderBtn.disabled = false;
      })
      .catch(() => { renderBtn.textContent = '✗ Error'; renderBtn.disabled = false; });
  });

  // Initialize at frame 0
  window.addEventListener('load', () => goToFrame(0));

  // Hot reload via SSE
  const es = new EventSource('/__hf_reload');
  es.onmessage = () => window.location.reload();
})();
</script>
`;

/**
 * Start the preview dev server.
 * - Serves the scene with an injected overlay (timeline controls + render button)
 * - Watches for file changes and sends SSE reload events
 * - Exposes /__hf_render to submit jobs to the HTTP API (if running)
 */
export async function startPreview(options: PreviewOptions): Promise<void> {
  const { input, port } = options;
  const scene = await loadScene(input);

  // Determine the root dir for file watching
  const isUrl = /^https?:\/\//i.test(input);
  const rootDir = isUrl ? null : fs.statSync(path.resolve(input)).isDirectory()
    ? path.resolve(input)
    : path.dirname(path.resolve(input));

  // SSE clients list
  const sseClients: http.ServerResponse[] = [];

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';

    // SSE endpoint for hot reload
    if (url === '/__hf_reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(':\n\n'); // comment to keep connection alive
      sseClients.push(res);
      req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      return;
    }

    // Submit to local API render endpoint
    if (url === '/__hf_render' && req.method === 'POST') {
      const { buildApp } = await import('./index');
      const app = buildApp();
      await app.ready();

      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', async () => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as { config: Record<string, unknown> };
        const response = await app.inject({
          method: 'POST',
          url: '/jobs',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input, config: body.config }),
        });
        res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
        res.end(response.body);
      });
      return;
    }

    // Proxy to the scene server if it's a remote URL
    if (isUrl) {
      res.writeHead(302, { Location: scene.url });
      res.end();
      return;
    }

    // Serve the local scene — intercept HTML to inject overlay
    if (!rootDir) { res.writeHead(500); res.end(); return; }

    const targetPath = url === '/' ? 'index.html' : url.replace(/\?.*/, '').slice(1);
    const fullPath = path.join(rootDir, targetPath);

    if (
      (targetPath === 'index.html' || targetPath === '') &&
      fs.existsSync(path.join(rootDir, 'index.html'))
    ) {
      let html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
      html = html.replace('</body>', `${OVERLAY_SCRIPT}</body>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Serve static assets
    serveHandler(req, res, { public: rootDir, directoryListing: false });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  HyperFrame Preview  →  http://127.0.0.1:${port}`);
    console.log(`  Scene: ${isUrl ? input : path.resolve(input)}`);
    console.log(`  Hot reload: enabled\n`);
  });

  // File watcher for hot reload
  if (rootDir) {
    const watcher = chokidar.watch(rootDir, {
      ignoreInitial: true,
      ignored: /node_modules/,
    });

    const reload = () => {
      sseClients.forEach((c) => c.write('data: reload\n\n'));
    };

    watcher.on('change', reload).on('add', reload).on('unlink', reload);

    process.on('SIGINT', async () => {
      await scene.cleanup();
      watcher.close();
      server.close();
      process.exit(0);
    });
  }
}
