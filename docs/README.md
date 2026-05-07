# HyperFrame

> Renderize animações HTML/CSS/JS em vídeo MP4 — frame a frame, via Puppeteer + FFmpeg.

HyperFrame é um motor de renderização de vídeo que usa um **navegador headless** (Chromium) como canvas de animação. Em vez de gravar uma tela em tempo real, ele avança o tempo virtual da cena frame por frame, captura screenshots em PNG e encoda tudo em H.264/AAC.

```
HTML + CSS + JS  →  [HyperFrame]  →  MP4 (1920×1080 @ 30fps)
```

---

## Navegação da Documentação

| Documento | Descrição |
|---|---|
| **[Arquitetura](./architecture.md)** | Diagrama do pipeline completo, módulos e fluxo de dados |
| **[API REST](./api.md)** | Referência de todos os endpoints do servidor |
| **[CLI](./cli.md)** | Comandos de linha de comando, flags e exemplos |
| **[Autoria de Cenas](./scene-authoring.md)** | Como escrever cenas HyperFrame (`window.setFrame`, timing, assets) |
| **[Contribuindo](./contributing.md)** | Setup de desenvolvimento, convenções e build |

---

## Instalação Rápida

```bash
# Dependências
npm install

# Compilar TypeScript
npm run build

# Iniciar servidor API (porta 3002)
node dist/cli/index.js serve
```

## Uso em 30 segundos

### Via CLI
```bash
# Renderizar um arquivo HTML local
node dist/cli/index.js render Modelos/minha-animacao.html -o output/video.mp4

# Com opções explícitas
node dist/cli/index.js render Modelos/minha-animacao.html \
  --fps 30 --width 1920 --height 1080 -o output/video.mp4
```

### Via API
```bash
# Subir cena HTML e iniciar job
curl -X POST http://localhost:3002/jobs \
  -F "scene=@Modelos/minha-animacao.html" \
  -F 'config={"fps":30,"durationInFrames":900,"width":1920,"height":1080,"concurrency":1,"outputPath":"output/video.mp4"}'

# Monitorar progresso
curl http://localhost:3002/jobs/<job-id>
```

---

## Como Funciona (Resumo)

1. **Cena HTML** declara `window.hyperframe` com metadados (fps, frames, resolução)
2. **HyperFrame** abre o Chromium em modo headless e navega até a cena
3. Para cada frame `n`, chama **`window.setFrame(n)`** — a cena atualiza todos os elementos
4. Captura **screenshot PNG** e salva em disco
5. Ao final, **FFmpeg** encoda a sequência PNG → MP4 (H.264, CRF 18)

> Para uma explicação visual interativa, veja o **[Vídeo de Documentação](../Modelos/hyperframe-docs.html)** — uma cena HyperFrame que demonstra o próprio sistema.

---

## Stack Técnica

| Componente | Tecnologia |
|---|---|
| Runtime | Node.js v20+ / TypeScript 5.4 |
| Navegador headless | Puppeteer ^24 (Chromium) |
| Encoder de vídeo | FFmpeg via fluent-ffmpeg + ffmpeg-static |
| Servidor HTTP | Fastify ^4 |
| Paralelismo de frames | worker_threads |
| Fila de jobs | p-queue |

---

## Exemplo de Cena Mínima

```html
<!DOCTYPE html>
<html>
<head>
  <script>
    window.hyperframe = { fps: 30, durationInFrames: 90, width: 800, height: 600 };
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

→ Próximo: **[Arquitetura do Sistema](./architecture.md)**
