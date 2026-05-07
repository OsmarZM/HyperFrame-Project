import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import PQueue from 'p-queue';
import { render } from '../core/orchestrator';
import { resolveConfig, storagePath, defaultConcurrency } from '../core/config';
import { insertJob, updateJobStatus, updateJobProgress, getJob, deleteJob, listJobs } from './db';
import { adaptHtmlFile } from '../core/html-adapter';
import type { HyperFrameConfig, RenderJob } from '../types';

const queue = new PQueue({ concurrency: 1 });

export interface ServerOptions {
  port: number;
  host: string;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const app = buildApp();
  await app.listen({ port: options.port, host: options.host });
  console.log(`\n  HyperFrame API listening on http://${options.host}:${options.port}\n`);
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB max upload

  const outputDir = path.join(storagePath(), 'jobs');
  fs.mkdirSync(outputDir, { recursive: true });

  app.register(staticPlugin, {
    root: outputDir,
    prefix: '/files/',
    decorateReply: false,
  });

  // ── GET / (Web UI) ──────────────────────────────────────────────────────────
  const publicDir = path.join(__dirname, '../../public');
  app.get('/', async (_req, reply) => {
    const uiPath = path.join(publicDir, 'index.html');
    if (!fs.existsSync(uiPath)) {
      return reply.code(404).send({ error: 'UI not found — run from project root' });
    }
    return reply.type('text/html').send(fs.createReadStream(uiPath));
  });

  // ── POST /jobs ──────────────────────────────────────────────────────────────
  // Body can be:
  //   - multipart: field "config" (JSON) + optional file "scene" (.zip or .html)
  //   - JSON: { input: "https://...", config?: {...}, concurrency?: N }
  app.post('/jobs', async (req, reply) => {
    let input: string;
    let explicitConfig: Partial<HyperFrameConfig> = {};
    let concurrency = defaultConcurrency();

    const contentType = req.headers['content-type'] ?? '';

    if (contentType.includes('multipart/form-data')) {
      const parts = req.parts();
      const tmpDir = path.join(outputDir, `upload-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });

      let audioFilePath: string | undefined;
      let wasAdapted = false;
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'scene') {
          const ext = path.extname(part.filename ?? '').toLowerCase();
          if (ext === '.zip') {
            // Extract zip
            const zipPath = path.join(tmpDir, 'scene.zip');
            await writeStream(part.file, zipPath);
            await extractZip(zipPath, tmpDir);
            fs.unlinkSync(zipPath);
            // Auto-adapt extracted index.html if it lacks window.setFrame
            const zipEntry = path.join(tmpDir, 'index.html');
            if (fs.existsSync(zipEntry)) wasAdapted = adaptHtmlFile(zipEntry);
          } else {
            // Treat as single HTML file — always save as index.html so scene-loader finds it
            const savedPath = path.join(tmpDir, 'index.html');
            await writeStream(part.file, savedPath);
            // Auto-adapt: inject virtual clock + RAF shim if page has no window.setFrame
            wasAdapted = adaptHtmlFile(savedPath);
          }
          input = tmpDir;
        } else if (part.type === 'file' && part.fieldname === 'audio') {
          const audioExt = path.extname(part.filename ?? '').toLowerCase() || '.mp3';
          audioFilePath = path.join(tmpDir, `audio${audioExt}`);
          await writeStream(part.file, audioFilePath);
        } else if (part.type === 'field' && part.fieldname === 'config') {
          explicitConfig = JSON.parse(part.value as string) as Partial<HyperFrameConfig>;
        } else if (part.type === 'field' && part.fieldname === 'concurrency') {
          concurrency = parseInt(part.value as string, 10);
        }
      }
      if (audioFilePath) explicitConfig.audio = audioFilePath;
      // Adapted pages use a virtual clock — running multiple Puppeteer workers
      // against the same canvas-heavy page destroys memory. Force single worker.
      if (wasAdapted) concurrency = 1;
      input ??= tmpDir;
    } else {
      const body = req.body as { input?: string; config?: Partial<HyperFrameConfig>; concurrency?: number };
      if (!body?.input) {
        return reply.code(400).send({ error: 'Missing "input" field' });
      }
      input = body.input;
      explicitConfig = body.config ?? {};
      concurrency = body.concurrency ?? concurrency;
    }

    const id = uuidv4();
    const jobOutputDir = path.join(outputDir, id);
    fs.mkdirSync(jobOutputDir, { recursive: true });
    const outputFile = path.join(jobOutputDir, 'output.mp4');

    const config = resolveConfig(explicitConfig);

    const job: RenderJob = {
      id,
      input,
      output: outputFile,
      config,
      concurrency,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    };

    insertJob(job);

    // Enqueue the render
    queue.add(() => runJob(id));

    return reply.code(202).send({ id, status: 'queued' });
  });

  // ── GET /jobs ───────────────────────────────────────────────────────────────
  app.get('/jobs', async (_req, reply) => {
    return reply.send(listJobs());
  });

  // ── GET /jobs/:id ───────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return reply.send(job);
  });

  // ── GET /jobs/:id/output ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id/output', async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status !== 'done') return reply.code(409).send({ error: `Job is ${job.status}` });

    if (!fs.existsSync(job.output)) {
      return reply.code(404).send({ error: 'Output file not found' });
    }

    const filename = path.basename(job.output);
    const stat = fs.statSync(job.output);

    reply.header('Content-Type', 'video/mp4');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Length', stat.size);
    return reply.send(fs.createReadStream(job.output));
  });

  // ── DELETE /jobs/:id ────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    // Clean up files
    const jobDir = path.dirname(job.output);
    fs.rmSync(jobDir, { recursive: true, force: true });
    deleteJob(req.params.id);

    return reply.code(204).send();
  });

  return app;
}

async function runJob(id: string): Promise<void> {
  const job = getJob(id);
  if (!job) return;

  updateJobStatus(id, 'rendering', { startedAt: Date.now() });

  try {
    let framesWritten = 0;
    let totalFrames = 1; // updated by onStart

    await render({
      input: job.input,
      output: job.output,
      config: job.config,
      concurrency: job.concurrency,
      onStart: (total) => {
        totalFrames = total;
      },
      onFrameWritten: (_i, _total) => {
        framesWritten++;
        // Use a monotonically increasing counter so parallel workers never go backwards
        const progress = Math.min(80, Math.floor((framesWritten / totalFrames) * 80));
        updateJobProgress(id, progress);
      },
      onEncodeProgress: (pct) => {
        const progress = 80 + Math.floor(pct * 0.2); // 80–100% during encode
        updateJobProgress(id, progress);
      },
    });

    updateJobStatus(id, 'done', { progress: 100, finishedAt: Date.now() });
  } catch (err) {
    updateJobStatus(id, 'failed', {
      error: (err as Error).message,
      finishedAt: Date.now(),
    });
  }
}

async function writeStream(stream: NodeJS.ReadableStream, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    stream.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    stream.on('error', reject);
  });
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const unzipper = await import('unzipper');
  await unzipper.Open.file(zipPath).then((d) => d.extract({ path: destDir }));
}
