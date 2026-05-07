import type { FramePartition } from '../types';

/**
 * Divide the total frame range [0, totalFrames) into `count` roughly-equal
 * partitions. The last partition gets any remainder frames.
 */
export function partitionFrames(totalFrames: number, count: number): FramePartition[] {
  const workers = Math.min(count, totalFrames);
  const baseSize = Math.floor(totalFrames / workers);
  const remainder = totalFrames % workers;

  const partitions: FramePartition[] = [];
  let cursor = 0;

  for (let i = 0; i < workers; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    partitions.push({
      workerId: i,
      startFrame: cursor,
      endFrame: cursor + size - 1,
    });
    cursor += size;
  }

  return partitions;
}
