import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import type { HyperFrameConfig } from '../types';

// Point fluent-ffmpeg to the bundled static binary
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface EncodeOptions {
  framesDir: string;
  output: string;
  config: HyperFrameConfig;
  /** Called with progress 0–100 */
  onProgress?: (percent: number) => void;
}

/**
 * Encode a sequence of PNG frames (frame-00000.png … frame-NNNNN.png) plus
 * optional audio file(s) into a single MP4 (H.264 / AAC).
 */
export async function encodeVideo(options: EncodeOptions): Promise<void> {
  const { framesDir, output, config, onProgress } = options;

  const outputDir = path.dirname(output);
  fs.mkdirSync(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Video input: PNG frame sequence
    cmd
      .input(path.join(framesDir, 'frame-%05d.png'))
      .inputOption(`-framerate ${config.fps}`)
      .inputOption('-start_number 0');

    // Collect all audio tracks
    const tracks = collectAudioTracks(config);

    tracks.forEach((track) => {
      cmd.input(track.file);
    });

    // Video codec settings
    cmd
      .videoCodec('libx264')
      .outputOption('-pix_fmt yuv420p')
      .outputOption('-crf 18')
      .outputOption('-preset medium')
      .outputOption('-movflags +faststart');

    // Audio codec settings (only when tracks exist)
    if (tracks.length === 1 && (tracks[0].startAt ?? 0) === 0) {
      cmd.audioCodec('aac').outputOption('-b:a 192k').outputOption('-shortest');
    } else if (tracks.length > 1) {
      buildComplexAudioFilter(cmd, tracks, config);
    }

    cmd
      .output(output)
      .on('progress', (info: { percent?: number }) => {
        onProgress?.(Math.min(Math.round(info.percent ?? 0), 100));
      })
      .on('end', () => {
        onProgress?.(100);
        resolve();
      })
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

interface ResolvedAudioTrack {
  file: string;
  startAt: number;
}

function collectAudioTracks(config: HyperFrameConfig): ResolvedAudioTrack[] {
  const tracks: ResolvedAudioTrack[] = [];

  if (config.audio) {
    tracks.push({ file: config.audio, startAt: 0 });
  }

  if (config.audioTracks) {
    config.audioTracks.forEach((t) => {
      tracks.push({ file: t.file, startAt: t.startAt ?? 0 });
    });
  }

  return tracks;
}

function buildComplexAudioFilter(
  cmd: ffmpeg.FfmpegCommand,
  tracks: ResolvedAudioTrack[],
  _config: HyperFrameConfig,
): void {
  // Build adelay + amix filter for multiple audio tracks
  const delayFilters = tracks.map((t, i) => {
    const delayMs = Math.round(t.startAt * 1000);
    return `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`;
  });

  const mixInputs = tracks.map((_, i) => `[a${i}]`).join('');
  const complexFilter = [
    ...delayFilters,
    `${mixInputs}amix=inputs=${tracks.length}:duration=first:dropout_transition=0[aout]`,
  ].join('; ');

  cmd
    .complexFilter(complexFilter, 'aout')
    .audioCodec('aac')
    .outputOption('-b:a 192k')
    .outputOption('-shortest');
}
