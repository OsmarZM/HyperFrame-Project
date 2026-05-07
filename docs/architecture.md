# Arquitetura do HyperFrame

← [Voltar ao README](./README.md) | → [API REST](./api.md)

---

## Visão Geral do Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTRADA DA CENA                                 │
│   URL remota  │  Arquivo .html  │  Pasta com index.html  │  .zip        │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  scene-loader   │  Inicia servidor HTTP local (se local)
                   │  (src/core/)    │  Resolve URL para Puppeteer
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  html-adapter   │  Injeta shim de tempo virtual
                   │  (src/core/)    │  caso a cena não tenha window.setFrame
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  orchestrator   │  Lê window.hyperframe da cena
                   │  (src/core/)    │  Mescla config (API > window > defaults)
                   └────────┬────────┘
                            │
              ┌─────────────┴──────────────┐
              │    partitionFrames()        │
              │  Divide frames em fatias    │
              │  (uma por worker_thread)    │
              └─────────────┬──────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
  ┌────────────┐    ┌────────────┐    ┌────────────┐
  │  renderer  │    │  renderer  │    │  renderer  │  worker_threads
  │  Worker #1 │    │  Worker #2 │    │  Worker #N │  (Chromium paralelo)
  │  frame 0–N │    │  frame N–M │    │  frame M–Z │
  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
        │                 │                 │
        └─────────────────┴─────────────────┘
                          │
                  frame-00000.png
                  frame-00001.png
                       ...
                  frame-NNNNN.png
                          │
                          ▼
                   ┌─────────────────┐
                   │    encoder      │  FFmpeg: PNG → H.264/AAC MP4
                   │  (src/core/)    │  CRF 18, yuv420p, faststart
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │   output.mp4    │  Vídeo final entregue
                   └─────────────────┘
```

---

## Módulos do Core

### `orchestrator.ts` — Maestro do Pipeline

Coordena todas as etapas. É o único ponto de entrada público do core.

```
render(options)
  ├── loadScene()        → resolve URL
  ├── readSceneMetadata()→ lê window.hyperframe via Puppeteer
  ├── resolveConfig()    → mescla configs
  ├── partitionFrames()  → divide carga
  ├── runWorkerPool() ──── spawn worker_threads
  │     └── renderFrames() (em cada worker)
  └── encodeVideo()      → FFmpeg
```

### `renderer.ts` — Motor de Captura

Roda dentro de cada `worker_thread`. Abre um Chromium, navega até a cena e para cada frame:

```
renderFrames(options)
  ├── puppeteer.launch()         → browser headless
  ├── page.setViewport()         → resolução exata
  ├── page.addStyleTag()         → pausa CSS animations
  ├── page.goto(url)             → carrega cena
  ├── page.evaluate(hyperframeReady) → aguarda assets
  └── loop frame i..j:
        ├── page.evaluate(setFrame, i) → atualiza DOM
        └── page.screenshot()          → PNG em disco
```

**Flags do Chromium usadas:**
```
--no-sandbox
--disable-gpu
--disable-gpu-vsync
--disable-frame-rate-limit
--hide-scrollbars
--mute-audio
```

### `encoder.ts` — Codificador FFmpeg

Pega a pasta com os PNGs e gera o MP4 final.

```
encodeVideo(options)
  ├── input: frame-%05d.png  @ fps configurado
  ├── videoCodec: libx264
  ├── pix_fmt: yuv420p        → compatibilidade máxima
  ├── crf: 18                 → alta qualidade
  ├── preset: medium
  ├── movflags: +faststart    → streaming web
  └── audio: AAC 192k (se fornecido)
```

### `html-adapter.ts` — Shim de Compatibilidade

Para cenas que não foram escritas para HyperFrame, injeta automaticamente:

```
Shim injetado no <head>:
  ├── Date.now()           → relógio virtual (ms)
  ├── performance.now()    → relógio virtual (ms)
  ├── requestAnimationFrame → fila virtual (drena 1x por setFrame)
  ├── setTimeout/setInterval→ timers virtuais (máx 50 fires/frame)
  └── window.setFrame(n)   → avança tempo + dispara RAF + timers
```

### `scene-loader.ts` — Resolução de Cenas

| Entrada | Ação |
|---|---|
| `https://...` | Usa URL diretamente |
| `/caminho/para/pasta/` | Inicia servidor HTTP na pasta |
| `/caminho/para/arquivo.html` | Inicia servidor HTTP no diretório pai |

O servidor local injeta headers CORS para isolamento correto:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cache-Control: no-store
```

### `worker-pool.ts` — Paralelismo

```
runWorkerPool(partitions)
  └── Promise.all(
        partitions.map(p => new Worker('render-worker.js', { workerData: p }))
      )

Comunicação via postMessage:
  worker → parent: { type: 'frame', frameIndex: n }
```

### `partition.ts` — Divisão de Carga

Divide `durationInFrames` em fatias iguais para N workers:

```
durationInFrames: 900, concurrency: 4
→ Worker 0: frames   0–224
→ Worker 1: frames 225–449
→ Worker 2: frames 450–674
→ Worker 3: frames 675–899
```

---

## Camada de Servidor (API)

```
src/server/
  ├── index.ts    → Fastify + rotas REST
  ├── db.ts       → Jobs persistidos em JSON (storage/)
  └── preview.ts  → Servidor de preview em tempo real
```

### Fluxo de um Job via API

```
POST /jobs (multipart)
  │
  ├── Salva .html/.zip em storage/jobs/<uuid>/
  ├── Cria job { status: 'queued' } em db.json
  └── Enfileira em p-queue (concorrência 1)
         │
         ▼
      render() ──→ atualiza progress via updateJobProgress()
         │
         ▼
      status: 'done' ou 'failed'
```

---

## Diagrama de Dependências dos Módulos

```
cli/index.ts
    └── core/orchestrator.ts
            ├── core/scene-loader.ts
            ├── core/config.ts
            ├── core/renderer.ts        ← também usado via worker
            ├── core/html-adapter.ts
            ├── core/partition.ts
            ├── core/worker-pool.ts
            │       └── core/render-worker.ts (worker_thread)
            │               └── core/renderer.ts
            └── core/encoder.ts

server/index.ts
    ├── core/orchestrator.ts
    ├── core/config.ts
    ├── core/html-adapter.ts
    └── server/db.ts
```

---

## Tipos Principais (`src/types.ts`)

```typescript
interface HyperFrameConfig {
  fps: number;                // padrão: 30
  durationInFrames: number;   // total de frames
  width: number;              // padrão: 1920
  height: number;             // padrão: 1080
  pixelRatio: number;         // padrão: 1
  audio?: string;             // arquivo de áudio opcional
  audioTracks?: AudioTrack[]; // múltiplas faixas com offset
}

interface RenderJob {
  id: string;          // UUID v4
  input: string;       // URL ou caminho da cena
  output: string;      // caminho do MP4 de saída
  config: HyperFrameConfig;
  concurrency: number;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  progress: number;    // 0–100
  createdAt: number;   // timestamp ms
  startedAt?: number;
  finishedAt?: number;
}
```

---

← [README](./README.md) | → [API REST](./api.md)
