/**
 * render-worker.ts
 * This file is compiled to render-worker.js and executed inside a worker_thread.
 * It receives WorkerData via workerData and posts progress messages back.
 */
import { workerData, parentPort } from 'worker_threads';
import { renderFrames } from './renderer';
import type { WorkerData } from '../types';

const data = workerData as WorkerData;

renderFrames({
  sceneUrl: data.sceneUrl,
  framesDir: data.framesDir,
  config: data.config,
  partition: data.partition,
  onFrameWritten: (frameIndex) => {
    parentPort?.postMessage({ type: 'frame', frameIndex });
  },
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[Worker ${data.partition.workerId}] Error:`, err);
    process.exit(1);
  });
