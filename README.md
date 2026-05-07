# HyperFrame 🎬

> **Motor de renderização de vídeo para animações web.**
> Converte HTML + CSS + JS em MP4 de alta qualidade — frame a frame, via Puppeteer + FFmpeg.

```
HTML + CSS + JS  →  [HyperFrame]  →  MP4 (H.264 / 1920×1080 / 30fps)
```

---

## Como Funciona

O HyperFrame não grava a tela em tempo real. Ele **controla o tempo virtualmente**:

1. Abre a cena no Chromium (headless)
2. Para cada frame `n`, chama `window.setFrame(n)` — a cena atualiza o DOM
3. Captura um screenshot PNG
4. FFmpeg encoda a sequência em MP4 (H.264, CRF 18)

```
Cena HTML expõe:
  window.hyperframe = { fps, durationInFrames, width, height }
  window.setFrame   = (n) => { /* atualiza DOM */ }
  window.hyperframeReady   → Promise (pré-carrega assets)
```

---

## Instalação

```bash
git clone https://github.com/FortaTech/hyperframe.git
cd hyperframe
npm install
npm run build
```

**Requisitos:** Node.js v20+, npm v10+

---

## Uso Rápido

### CLI
```bash
# Renderizar um arquivo HTML
node dist/cli/index.js render Modelos/minha-cena.html -o output/video.mp4

# Iniciar servidor API
node dist/cli/index.js serve
```

### API REST
```bash
# Submeter job de renderização
curl -X POST http://localhost:3002/jobs \
  -F "scene=@minha-cena.html" \
  -F 'config={"fps":30,"durationInFrames":900,"width":1920,"height":1080}'

# Checar progresso
curl http://localhost:3002/jobs/<job-id>
```

### Cena Mínima

```html
<!DOCTYPE html>
<html>
<head>
  <script>
    window.hyperframe = { fps: 30, durationInFrames: 90, width: 1920, height: 1080 };
    window.setFrame = function(n) {
      const t = n / 30; // segundos
      document.getElementById('box').style.left = (t * 100) + 'px';
    };
  </script>
</head>
<body>
  <div id="box" style="position:absolute;width:50px;height:50px;background:red;top:50px;"></div>
</body>
</html>
```

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/README.md](./docs/README.md) | Visão geral e quickstart |
| [docs/architecture.md](./docs/architecture.md) | Pipeline completo com diagramas |
| [docs/api.md](./docs/api.md) | Referência da API REST |
| [docs/cli.md](./docs/cli.md) | Comandos e flags do CLI |
| [docs/scene-authoring.md](./docs/scene-authoring.md) | Como escrever cenas HyperFrame |
| [docs/contributing.md](./docs/contributing.md) | Setup de desenvolvimento |

### Vídeo de Documentação

O arquivo [Modelos/hyperframe-docs.html](./Modelos/hyperframe-docs.html) é uma **cena HyperFrame de 60 segundos** que explica visualmente o sistema — renderizável com o próprio motor.

```bash
node dist/cli/index.js render Modelos/hyperframe-docs.html \
  -o output/hyperframe-docs.mp4
```

---

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Node.js v20+ / TypeScript 5.4 |
| Navegador headless | Puppeteer ^24 (Chromium) |
| Encoder | FFmpeg via fluent-ffmpeg + ffmpeg-static |
| Servidor HTTP | Fastify ^4 |
| Paralelismo | worker_threads |
| Fila de jobs | p-queue |

---

## Scripts

```bash
npm run build   # Compila TypeScript → dist/
npm run dev     # Modo watch
npm start       # Executa o CLI (node dist/cli/index.js)
npm run lint    # ESLint
```

---

## Licença

MIT — © 2026 [FortaTech](https://fortatech.com.br)
