import path from 'path';
import os from 'os';
import type { HyperFrameConfig } from '../types';

export const DEFAULT_CONFIG: HyperFrameConfig = {
  fps: 30,
  durationInFrames: 150, // 5 seconds at 30fps
  width: 1920,
  height: 1080,
  pixelRatio: 1,
};

/**
 * Merge priority: explicit options > window.hyperframe values > defaults.
 * `windowValues` come from evaluating window.hyperframe inside Puppeteer.
 */
export function resolveConfig(
  explicit: Partial<HyperFrameConfig>,
  windowValues?: Partial<HyperFrameConfig>,
): HyperFrameConfig {
  const merged: HyperFrameConfig = {
    ...DEFAULT_CONFIG,
    ...(windowValues ?? {}),
    ...Object.fromEntries(
      Object.entries(explicit).filter(([, v]) => v !== undefined && v !== null),
    ),
  };

  // Normalize audio path to absolute if it's relative and not a URL
  if (merged.audio && !merged.audio.startsWith('http') && !path.isAbsolute(merged.audio)) {
    merged.audio = path.resolve(process.cwd(), merged.audio);
  }

  if (merged.audioTracks) {
    merged.audioTracks = merged.audioTracks.map((t) => ({
      ...t,
      file: t.file.startsWith('http') || path.isAbsolute(t.file)
        ? t.file
        : path.resolve(process.cwd(), t.file),
    }));
  }

  return merged;
}

/** Duration of the video in seconds */
export function durationInSeconds(config: HyperFrameConfig): number {
  return config.durationInFrames / config.fps;
}

/** Path where HyperFrame stores temp/storage files */
export function storagePath(): string {
  return path.join(process.cwd(), 'storage');
}

/** Number of parallel workers to use */
export function defaultConcurrency(): number {
  return Math.max(1, os.cpus().length - 1);
}
