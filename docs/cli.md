# CLI — HyperFrame

← [API REST](./api.md) | → [Autoria de Cenas](./scene-authoring.md)

---

## Instalação do binário

Após compilar com `npm run build`, o CLI fica disponível em:
```
dist/cli/index.js
```

Para usar globalmente:
```bash
npm link
hyperframe --help
```

---

## Comandos

### `hyperframe render <input>`

Renderiza uma cena diretamente (sem servidor).

```
hyperframe render <input> [opções]

<input>:
  - Caminho para arquivo .html
  - Caminho para pasta com index.html
  - URL remota (https://...)
```

**Flags:**

| Flag | Tipo | Padrão | Descrição |
|---|---|---|---|
| `-o, --output <file>` | string | `output.mp4` | Caminho do MP4 de saída |
| `--fps <n>` | number | `30` | Frames por segundo |
| `--duration <s>` | number | — | Duração em segundos (calcula frames) |
| `--frames <n>` | number | — | Total de frames (sobrepõe --duration) |
| `--width <px>` | number | `1920` | Largura do viewport |
| `--height <px>` | number | `1080` | Altura do viewport |
| `--pixel-ratio <r>` | number | `1` | Device pixel ratio |
| `--audio <file>` | string | — | Arquivo de áudio para misturar |
| `--concurrency <n>` | number | CPUs-1 | Workers Puppeteer paralelos |

**Exemplos:**
```bash
# Básico
hyperframe render Modelos/animacao.html -o output/video.mp4

# 4K
hyperframe render Modelos/animacao.html --width 3840 --height 2160 -o output/4k.mp4

# Com áudio e duração explícita
hyperframe render Modelos/animacao.html \
  --duration 30 --fps 30 \
  --audio assets/trilha.mp3 \
  -o output/com-audio.mp4

# Alta qualidade, baixa velocidade (mais workers = mais RAM)
hyperframe render Modelos/animacao.html --concurrency 4 -o output/video.mp4
```

---

### `hyperframe serve`

Inicia o servidor HTTP com a API REST e Web UI.

```
hyperframe serve [opções]
```

**Flags:**

| Flag | Padrão | Descrição |
|---|---|---|
| `--port <n>` | `3002` | Porta HTTP |
| `--host <addr>` | `127.0.0.1` | Endereço de bind |

**Exemplos:**
```bash
# Padrão (só acessível localmente)
hyperframe serve

# Acessível na rede local
hyperframe serve --host 0.0.0.0 --port 3002

# Ou diretamente com Node:
node dist/cli/index.js serve
```

---

### `hyperframe --help`

```
Usage: hyperframe [options] [command]

Render web scenes (HTML/CSS/JS) to MP4 — frame by frame

Options:
  -V, --version    output the version number
  -h, --help       display help for command

Commands:
  render <input>   Render a scene to MP4
  serve            Start the HyperFrame API server
  help [command]   display help for command
```

---

## Saída do CLI durante render

```
  HyperFrame — Rendering: Modelos/animacao.html
  Output: C:\Projetos\HyperFrame\output\video.mp4

  Rendering  ████████████████████░░░░░░░░  67%  (603/900 frames)
  Encoding   ████████████████████████████ 100%

  ✔ Done in 92.4s — output\video.mp4
```

---

## Usando via `npm start`

O `package.json` define:
```json
"scripts": {
  "start": "node dist/cli/index.js",
  "build": "tsc",
  "dev":   "tsc --watch"
}
```

```bash
# Renderizar via npm
npm start -- render Modelos/animacao.html -o output/video.mp4

# Servir via npm
npm start -- serve
```

---

## Variáveis de Ambiente

| Variável | Efeito |
|---|---|
| `HYPERFRAME_PORT` | Porta padrão do servidor (sobreposta por `--port`) |
| `HYPERFRAME_STORAGE` | Diretório de armazenamento dos jobs (padrão: `./storage`) |
| `PUPPETEER_EXECUTABLE_PATH` | Caminho alternativo para o Chromium |

---

← [API REST](./api.md) | → [Autoria de Cenas](./scene-authoring.md)
