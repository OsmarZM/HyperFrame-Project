#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { render } from '../core/orchestrator';
import { defaultConcurrency } from '../core/config';

const program = new Command();

program
  .name('hyperframe')
  .description('Render web scenes (HTML/CSS/JS) to MP4 — frame by frame')
  .version('0.1.0');

// ─── hyperframe render ────────────────────────────────────────────────────────
program
  .command('render <input>')
  .description('Render a scene to MP4. <input> can be a URL, folder, or HTML file.')
  .option('-o, --output <file>', 'Output MP4 file path', 'output.mp4')
  .option('--fps <number>', 'Frames per second', parseFloat)
  .option('--duration <seconds>', 'Duration in seconds (overrides window.hyperframe)', parseFloat)
  .option('--frames <count>', 'Total number of frames (overrides --duration)', parseInt)
  .option('--width <px>', 'Viewport width', parseInt)
  .option('--height <px>', 'Viewport height', parseInt)
  .option('--pixel-ratio <ratio>', 'Device pixel ratio', parseFloat)
  .option('--audio <file>', 'Audio file to mix into the video')
  .option(
    '--concurrency <n>',
    `Number of parallel Puppeteer workers (default: ${defaultConcurrency()})`,
    parseInt,
  )
  .action(async (input: string, opts) => {
    const configOverrides: Record<string, unknown> = {};

    if (opts.fps != null) configOverrides.fps = opts.fps;
    if (opts.width != null) configOverrides.width = opts.width;
    if (opts.height != null) configOverrides.height = opts.height;
    if (opts.pixelRatio != null) configOverrides.pixelRatio = opts.pixelRatio;
    if (opts.audio != null) configOverrides.audio = opts.audio;

    if (opts.frames != null) {
      configOverrides.durationInFrames = opts.frames;
    } else if (opts.duration != null) {
      const fps = opts.fps ?? 30;
      configOverrides.durationInFrames = Math.round(opts.duration * fps);
    }

    const start = Date.now();
    let totalFrames = 0;
    let lastPct = -1;

    console.log(`\n  HyperFrame — Rendering: ${input}`);
    console.log(`  Output: ${path.resolve(opts.output)}\n`);

    try {
      await render({
        input,
        output: opts.output,
        config: configOverrides as never,
        concurrency: opts.concurrency,
        onStart: (total) => {
          totalFrames = total;
          console.log(`  Total frames: ${total}`);
          process.stdout.write('  Rendering  [');
        },
        onFrameWritten: (i, total) => {
          const pct = Math.floor((i / total) * 40);
          while (lastPct < pct) {
            process.stdout.write('█');
            lastPct++;
          }
        },
        onEncodeProgress: (pct) => {
          if (pct === 0) {
            const fill = '█'.repeat(40);
            if (lastPct < 40) process.stdout.write(fill.slice(lastPct));
            process.stdout.write('] 100%\n  Encoding…\n');
          }
        },
      });

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`\n  Done in ${elapsed}s  →  ${path.resolve(opts.output)}\n`);
    } catch (err) {
      console.error('\n  Render failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── hyperframe serve ─────────────────────────────────────────────────────────
program
  .command('serve')
  .description('Start the HyperFrame HTTP API server')
  .option('-p, --port <number>', 'Port to listen on', parseInt, 3002)
  .option('--host <host>', 'Host to bind to', '0.0.0.0')
  .action(async (opts) => {
    const { startServer } = await import('../server');
    await startServer({ port: opts.port, host: opts.host });
  });

// ─── hyperframe dev ───────────────────────────────────────────────────────────
program
  .command('dev <input>')
  .description('Start the preview dev server for a scene with live timeline controls')
  .option('-p, --port <number>', 'Port to listen on', parseInt, 7777)
  .action(async (input: string, opts) => {
    const { startPreview } = await import('../server/preview');
    await startPreview({ input, port: opts.port });
  });

// ─── hyperframe new ───────────────────────────────────────────────────────────
program
  .command('new <template> <destination>')
  .description('Scaffold a new scene from a built-in template')
  .option('--props <json>', 'JSON string of props to inject into hyperframe.json')
  .action(async (template: string, destination: string, opts) => {
    const templateSrc = path.join(__dirname, '../../templates', template);

    if (!fs.existsSync(templateSrc)) {
      console.error(`  Template "${template}" not found.`);
      console.error(`  Available templates: lower-third, slideshow, kenburns, waveform`);
      process.exit(1);
    }

    const destAbs = path.resolve(destination);
    fs.mkdirSync(destAbs, { recursive: true });

    copyDir(templateSrc, destAbs);

    // Inject props into hyperframe.json if provided
    if (opts.props) {
      const hfPath = path.join(destAbs, 'hyperframe.json');
      let existing: Record<string, unknown> = {};
      if (fs.existsSync(hfPath)) {
        existing = JSON.parse(fs.readFileSync(hfPath, 'utf8')) as Record<string, unknown>;
      }
      const props = JSON.parse(opts.props) as Record<string, unknown>;
      fs.writeFileSync(hfPath, JSON.stringify({ ...existing, ...props }, null, 2));
    }

    console.log(`\n  Created "${template}" scene at: ${destAbs}`);
    console.log(`  Run: hyperframe dev "${destAbs}"\n`);
  });

function copyDir(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

program.parse(process.argv);
