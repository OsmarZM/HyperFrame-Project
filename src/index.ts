export { render } from './core/orchestrator';
export { loadScene } from './core/scene-loader';
export { resolveConfig, DEFAULT_CONFIG, durationInSeconds, defaultConcurrency } from './core/config';
export { renderFrames, readSceneMetadata } from './core/renderer';
export { encodeVideo } from './core/encoder';
export { runWorkerPool } from './core/worker-pool';
export { partitionFrames } from './core/partition';
export type { HyperFrameConfig, RenderJob, JobStatus, FramePartition, AudioTrack, WorkerData } from './types';
