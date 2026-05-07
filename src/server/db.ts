/**
 * Lightweight JSON-file job store.
 * Uses an in-memory Map as primary store and persists to jobs.json on every
 * write — no native compilation required.
 */
import path from 'path';
import fs from 'fs';
import { storagePath } from '../core/config';
import type { RenderJob, JobStatus } from '../types';

// ── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map<string, RenderJob>();
let initialized = false;

function dbPath(): string {
  const dir = storagePath();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'jobs.json');
}

function load(): void {
  if (initialized) return;
  initialized = true;
  const p = dbPath();
  if (!fs.existsSync(p)) return;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const arr = JSON.parse(raw) as RenderJob[];
    arr.forEach((j) => cache.set(j.id, j));
  } catch {
    // Corrupt file — start fresh
  }
}

function persist(): void {
  fs.writeFileSync(dbPath(), JSON.stringify([...cache.values()], null, 2), 'utf8');
}

// ── Public API ───────────────────────────────────────────────────────────────

export function insertJob(job: RenderJob): void {
  load();
  cache.set(job.id, { ...job });
  persist();
}

export function updateJobStatus(
  id: string,
  status: JobStatus,
  extra: { progress?: number; error?: string; startedAt?: number; finishedAt?: number } = {},
): void {
  load();
  const job = cache.get(id);
  if (!job) return;
  cache.set(id, {
    ...job,
    status,
    progress: extra.progress ?? job.progress,
    error: extra.error ?? job.error,
    startedAt: extra.startedAt ?? job.startedAt,
    finishedAt: extra.finishedAt ?? job.finishedAt,
  });
  persist();
}

export function updateJobProgress(id: string, progress: number): void {
  load();
  const job = cache.get(id);
  if (!job) return;
  cache.set(id, { ...job, progress });
  persist();
}

export function getJob(id: string): RenderJob | null {
  load();
  return cache.get(id) ?? null;
}

export function deleteJob(id: string): boolean {
  load();
  const existed = cache.has(id);
  cache.delete(id);
  if (existed) persist();
  return existed;
}

export function listJobs(): RenderJob[] {
  load();
  return [...cache.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
}
