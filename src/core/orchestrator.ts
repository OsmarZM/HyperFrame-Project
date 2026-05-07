import path from 'path';
import os from 'os';
import fs from 'fs';
import { loadScene } from './scene-loader';
import { resolveConfig, defaultConcurrency } from './config';
import { readSceneMetadata } from './renderer';
import { partitionFrames } from './partition';
import { runWorkerPool } from './worker-pool';
import { renderFrames } from './renderer';
import { encodeVideo } from './encoder';
import type { HyperFrameConfig } from '../types';

export interface RenderOptions {
  /** URL or local folder/file path */
  input: string;
  /** Output MP4 file path */
  output: string;
  /** Config overrides (CLI/API options take priority over window.hyperframe) */
  config?: Partial<HyperFrameConfig>;
  /** Number of parallel Puppeteer workers (default: CPU count - 1) */
  concurrency?: number;
  /** Called with total frame count once determined */
  onStart?: (totalFrames: number) => void;
  /** Called after each frame is written (frame index 0-based) */
  onFrameWritten?: (frameIndex: number, total: number) => void;
  /** Called with FFmpeg encode progress 0–100 */
  onEncodeProgress?: (percent: number) => void;
}

/**
 * Full render pipeline:
 *   1. Resolve scene URL (starts local server if needed)
 *   2. Read window.hyperframe metadata
 *   3. Merge config (explicit > window > defaults)
 *   4. Render frames in parallel using worker_threads
 *   5. Encode frames + audio to MP4 with FFmpeg
 *   6. Cleanup temp files
 */
export async function render(options: RenderOptions): Promise<void> {
  const {
    input,
    output,
    config: explicitConfig = {},
    concurrency = defaultConcurrency(),
    onStart,
    onFrameWritten,
    onEncodeProgress,
  } = options;

  // Step 1: Resolve scene
  const scene = await loadScene(input);
  try {
    // Step 2: Read window.hyperframe metadata
    const windowMeta = await readSceneMetadata(scene.url, {
      fps: 30, width: 1920, height: 1080, pixelRatio: 1, durationInFrames: 1,
    });

    // Step 3: Merge config
    const config = resolveConfig(explicitConfig, windowMeta);

    onStart?.(config.durationInFrames);

    // Step 4: Render frames
    const framesDir = path.join(os.tmpdir(), `hyperframe-${Date.now()}`);
    fs.mkdirSync(framesDir, { recursive: true });

    try {
      const partitions = partitionFrames(config.durationInFrames, concurrency);
      let framesWritten = 0;

      if (partitions.length === 1) {
        // Single-threaded: run directly (avoids worker_thread overhead for small renders)
        await renderFrames({
          sceneUrl: scene.url,
          framesDir,
          config,
          partition: partitions[0],
          onFrameWritten: (i) => {
            framesWritten++;
            onFrameWritten?.(i, config.durationInFrames);
          },
        });
      } else {
        await runWorkerPool({
          sceneUrl: scene.url,
          framesDir,
          config,
          partitions,
          onFrameWritten: (i) => {
            framesWritten++;
            onFrameWritten?.(i, config.durationInFrames);
          },
        });
      }

      // Step 5: Encode
      await encodeVideo({
        framesDir,
        output,
        config,
        onProgress: onEncodeProgress,
      });
    } finally {
      // Step 6: Cleanup temp frames
      fs.rmSync(framesDir, { recursive: true, force: true });
    }
  } finally {
    await scene.cleanup();
  }
}
