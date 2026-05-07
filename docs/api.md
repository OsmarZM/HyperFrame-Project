# API REST — HyperFrame

← [Arquitetura](./architecture.md) | → [CLI](./cli.md)

O servidor HyperFrame expõe uma API HTTP via **Fastify** na porta **3002** (padrão).

```bash
# Iniciar servidor
node dist/cli/index.js serve
# ou
node dist/cli/index.js serve --port 3002 --host 0.0.0.0
```

---

## Endpoints

### `GET /`
Retorna a Web UI (interface gráfica em `public/index.html`).

---

### `POST /jobs`
Cria e enfileira um novo job de renderização.

**Aceita dois formatos:**

#### 1. Multipart Form-Data (recomendado para arquivos locais)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `scene` | file | ✅ | Arquivo `.html` ou `.zip` com a cena |
| `config` | text (JSON) | ✅ | Configuração do job |
| `audio` | file | ❌ | Faixa de áudio (mp3, wav, aac) |

**Exemplo com `curl`:**
```bash
curl -X POST http://localhost:3002/jobs \
  -F "scene=@Modelos/minha-cena.html" \
  -F 'config={"fps":30,"durationInFrames":900,"width":1920,"height":1080,"concurrency":1,"outputPath":"output/video.mp4"}'
```

**Exemplo com Node.js (`upload-job.js`):**
```javascript
const http = require('http');
const fs   = require('fs');
const path = require('path');

const boundary = '----HyperFrameBoundary';
const sceneFile = 'Modelos/minha-cena.html';
const config = {
  fps: 30, durationInFrames: 900,
  width: 1920, height: 1080,
  concurrency: 1,
  outputPath: 'output/video.mp4'
};

// Monta multipart manualmente e POST em localhost:3002/jobs
```

#### 2. JSON Body (para cenas remotas)

```json
{
  "input": "https://example.com/minha-cena",
  "config": {
    "fps": 30,
    "durationInFrames": 300,
    "width": 1920,
    "height": 1080
  },
  "concurrency": 2
}
```

**Resposta — 202 Accepted:**
```json
{
  "id": "30abad81-cfdb-4c12-a9c8-20ed223f2b2f",
  "status": "queued"
}
```

---

### `GET /jobs`
Lista todos os jobs.

```bash
curl http://localhost:3002/jobs
```

**Resposta — 200 OK:**
```json
[
  {
    "id": "30abad81-cfdb-4c12-a9c8-20ed223f2b2f",
    "status": "done",
    "progress": 100,
    "createdAt": 1746655080000,
    "finishedAt": 1746655142000
  }
]
```

---

### `GET /jobs/:id`
Retorna o estado atual de um job específico.

```bash
curl http://localhost:3002/jobs/30abad81-cfdb-4c12-a9c8-20ed223f2b2f
```

**Resposta — 200 OK:**
```json
{
  "id": "30abad81-cfdb-4c12-a9c8-20ed223f2b2f",
  "status": "rendering",
  "progress": 63,
  "config": {
    "fps": 30,
    "durationInFrames": 900,
    "width": 1920,
    "height": 1080,
    "pixelRatio": 1
  },
  "createdAt": 1746655080000,
  "startedAt": 1746655083000
}
```

**Status possíveis:**

| Status | Descrição |
|---|---|
| `queued` | Job na fila, aguardando execução |
| `rendering` | Frames sendo capturados/encodados |
| `done` | Vídeo gerado com sucesso |
| `failed` | Erro — checar campo `error` |

---

### `DELETE /jobs/:id`
Remove um job e seus arquivos temporários.

```bash
curl -X DELETE http://localhost:3002/jobs/30abad81-cfdb-4c12-a9c8-20ed223f2b2f
```

**Resposta — 200 OK:**
```json
{ "ok": true }
```

---

### `GET /files/:jobId/:filename`
Baixa o arquivo de saída gerado por um job.

```bash
curl -O http://localhost:3002/files/30abad81-cfdb-4c12-a9c8-20ed223f2b2f/video.mp4
```

---

## Schema de Configuração

```typescript
{
  // Obrigatórios
  fps: number;              // Ex: 30
  durationInFrames: number; // Ex: 900 (= 30s @ 30fps)
  width: number;            // Ex: 1920
  height: number;           // Ex: 1080

  // Opcionais
  pixelRatio?: number;      // Padrão: 1 (use 2 para 4K efetivo)
  concurrency?: number;     // Workers Puppeteer paralelos (padrão: CPUs - 1)
  outputPath?: string;      // Caminho do MP4 de saída
  audio?: string;           // Caminho para arquivo de áudio
  audioTracks?: [           // Múltiplas faixas
    { file: string, startAt?: number }
  ]
}
```

---

## Monitoramento via Loop PowerShell

```powershell
$jobId = "30abad81-cfdb-4c12-a9c8-20ed223f2b2f"
do {
  Start-Sleep -Seconds 5
  $j = (Invoke-WebRequest -Uri "http://localhost:3002/jobs/$jobId" -UseBasicParsing).Content | ConvertFrom-Json
  Write-Output "[$([datetime]::Now.ToString('HH:mm:ss'))] status=$($j.status) progress=$($j.progress)"
} while ($j.status -notin @('done','failed'))
```

---

## Códigos de Erro

| HTTP | Situação |
|---|---|
| 202 | Job criado com sucesso |
| 400 | Config inválida ou campo ausente |
| 404 | Job não encontrado |
| 500 | Erro interno no servidor |

---

← [Arquitetura](./architecture.md) | → [CLI](./cli.md)
