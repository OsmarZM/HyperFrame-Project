/**
 * Shared types used across the HyperFrame core.
 */

export interface HyperFrameConfig {
  /** Frames per second (default: 30) */
  fps: number;
  /** Total number of frames to render */
  durationInFrames: number;
  /** Viewport width in pixels (default: 1920) */
  width: number;
  /** Viewport height in pixels (default: 1080) */
  height: number;
  /** Device scale factor / pixel ratio (default: 1) */
  pixelRatio: number;
  /** Optional audio file path to mix into the final video */
  audio?: string;
  /** Optional: multiple audio tracks with time offsets */
  audioTracks?: AudioTrack[];
}

export interface AudioTrack {
  /** Path to audio file */
  file: string;
  /** Start offset in seconds (default: 0) */
  startAt?: number;
}

export interface RenderJob {
  id: string;
  /** URL or local folder path of the scene */
  input: string;
  output: string;
  config: HyperFrameConfig;
  /** Number of parallel Puppeteer workers */
  concurrency: number;
  status: JobStatus;
  progress: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export type JobStatus = 'queued' | 'rendering' | 'done' | 'failed';

export interface FramePartition {
  workerId: number;
  startFrame: number;
  endFrame: number; // inclusive
}

/** Data written to worker_thread via workerData */
export interface WorkerData {
  partition: FramePartition;
  sceneUrl: string;
  framesDir: string;
  config: HyperFrameConfig;
}
