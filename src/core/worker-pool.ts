import { Worker } from 'worker_threads';
import path from 'path';
import type { HyperFrameConfig, FramePartition, WorkerData } from '../types';

export interface WorkerPoolOptions {
  sceneUrl: string;
  framesDir: string;
  config: HyperFrameConfig;
  partitions: FramePartition[];
  /** Called each time any worker finishes a frame; receives the absolute frame index */
  onFrameWritten?: (frameIndex: number) => void;
}

/**
 * Spawn one worker_thread per partition and run renderFrames in each.
 * All workers run in parallel; resolves when every partition is done.
 */
export async function runWorkerPool(options: WorkerPoolOptions): Promise<void> {
  const { sceneUrl, framesDir, config, partitions, onFrameWritten } = options;

  const workerScript = path.join(__dirname, 'render-worker.js');

  await Promise.all(
    partitions.map(
      (partition) =>
        new Promise<void>((resolve, reject) => {
          const data: WorkerData = { partition, sceneUrl, framesDir, config };

          const worker = new Worker(workerScript, { workerData: data });

          worker.on('message', (msg: { type: string; frameIndex?: number }) => {
            if (msg.type === 'frame' && msg.frameIndex !== undefined) {
              onFrameWritten?.(msg.frameIndex);
            }
          });

          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`Worker ${partition.workerId} exited with code ${code}`));
            } else {
              resolve();
            }
          });
        }),
    ),
  );
}
