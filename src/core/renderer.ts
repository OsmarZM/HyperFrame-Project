import puppeteer, { type Browser, type Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import type { HyperFrameConfig, FramePartition } from '../types';

export interface RendererOptions {
  sceneUrl: string;
  framesDir: string;
  config: HyperFrameConfig;
  partition: FramePartition;
  /** Called after each frame is written; receives the absolute frame number (0-based) */
  onFrameWritten?: (frameIndex: number) => void;
}

/**
 * Render a range of frames for a given scene URL.
 * Opens Puppeteer, navigates to the scene, and for each frame in [startFrame, endFrame]:
 *   1. Calls window.setFrame(i) to update the DOM
 *   2. Takes a PNG screenshot
 *   3. Writes it as frame-NNNNN.png into framesDir
 */
export async function renderFrames(options: RendererOptions): Promise<void> {
  const { sceneUrl, framesDir, config, partition, onFrameWritten } = options;

  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await launchBrowser(config);
  // Per-frame timeout: if setFrame or screenshot hangs, abort after 60 s
  const FRAME_TIMEOUT_MS = 60_000;

  try {
    const page = await openPage(browser, config);
    await navigateAndWait(page, sceneUrl);

    for (let i = partition.startFrame; i <= partition.endFrame; i++) {
      const frameDeadline = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Frame ${i} timed out after ${FRAME_TIMEOUT_MS / 1000}s`)), FRAME_TIMEOUT_MS)
      );

      await Promise.race([
        page.evaluate((frame: number) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (globalThis as any);
          if (typeof w.setFrame === 'function') {
            const result = w.setFrame(frame);
            return result instanceof Promise ? result : Promise.resolve();
          }
          return Promise.resolve();
        }, i),
        frameDeadline,
      ]);

      const framePath = path.join(framesDir, `frame-${String(i).padStart(5, '0')}.png`);
      await Promise.race([
        page.screenshot({ path: framePath, type: 'png', omitBackground: false }),
        frameDeadline,
      ]);

      onFrameWritten?.(i);
    }
  } finally {
    await browser.close();
  }
}

async function launchBrowser(config: HyperFrameConfig): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      '--hide-scrollbars',
      '--mute-audio',
      '--font-render-hinting=none',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-translate',
      `--window-size=${config.width},${config.height}`,
    ],
  });
}

async function openPage(browser: Browser, config: HyperFrameConfig): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({
    width: config.width,
    height: config.height,
    deviceScaleFactor: config.pixelRatio,
  });
  // Disable CSS animations/transitions globally so setFrame controls everything
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-play-state: paused !important;
        transition: none !important;
      }
    `,
  });
  return page;
}

async function navigateAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });

  // Wait for window.hyperframeReady if the scene exposes it
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (globalThis as any);
    if (w.hyperframeReady instanceof Promise) {
      return w.hyperframeReady;
    }
    return Promise.resolve();
  });
}

/**
 * Read scene metadata from window.hyperframe (if available).
 * Used to auto-detect fps / durationInFrames / size when not provided by the user.
 */
export async function readSceneMetadata(
  sceneUrl: string,
  config: HyperFrameConfig,
): Promise<Partial<HyperFrameConfig>> {
  const browser = await launchBrowser(config);
  try {
    const page = await openPage(browser, config);
    await navigateAndWait(page, sceneUrl);

    const meta = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = (globalThis as any);
      return w.hyperframe ?? null;
    });

    return (meta as Partial<HyperFrameConfig>) ?? {};
  } finally {
    await browser.close();
  }
}
