# Autoria de Cenas HyperFrame

← [CLI](./cli.md) | → [Contribuindo](./contributing.md)

---

## O que é uma Cena HyperFrame?

Uma cena HyperFrame é qualquer arquivo HTML que implemente a **API de frame virtual**. O HyperFrame não grava a tela em tempo real — ele **avança o tempo manualmente**, frame a frame, e captura o estado do DOM em cada momento.

```
setFrame(0)   → screenshot → frame-00000.png
setFrame(1)   → screenshot → frame-00001.png
...
setFrame(899) → screenshot → frame-00899.png
```

---

## API Mínima Obrigatória

### `window.setFrame(n: number): void | Promise<void>`

Chamado pelo HyperFrame para cada frame. Recebe o índice do frame (0-based).

```javascript
window.setFrame = function(n) {
  const t = n / window.hyperframe.fps; // segundos
  // Atualiza o DOM baseado em 't'
};
```

---

## Metadados da Cena

### `window.hyperframe`

Objeto de configuração lido pelo HyperFrame antes de começar o render.

```javascript
window.hyperframe = {
  fps: 30,               // frames por segundo
  durationInFrames: 900, // 30s × 30fps = 900 frames
  width: 1920,           // largura do viewport
  height: 1080,          // altura do viewport
  // pixelRatio: 1,      // opcional, padrão 1
};
```

> Valores em `window.hyperframe` podem ser **sobrescritos** por opções passadas via CLI ou API.

---

## Carregamento de Assets

### `window.hyperframeReady`

Promise que o HyperFrame aguarda antes de começar a renderizar. Use para pré-carregar imagens, fontes ou dados.

```javascript
window.hyperframeReady = new Promise((resolve) => {
  const images = [
    'https://exemplo.com/produto.png',
    'https://exemplo.com/banner.jpg',
  ];

  let loaded = 0;
  images.forEach(src => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = img.onerror = () => {
      if (++loaded === images.length) resolve();
    };
    img.src = src;
  });
});
```

---

## Padrões de Animação

### 1. Animação Linear Simples

```javascript
window.setFrame = function(n) {
  const t = n / 30; // segundos
  const x = t * 200; // move 200px/s
  el.style.transform = `translateX(${x}px)`;
};
```

### 2. Usando Easing

```javascript
function easeInOut(t) {
  return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
}

window.setFrame = function(n) {
  const fps = window.hyperframe.fps;
  const totalFrames = window.hyperframe.durationInFrames;
  const progress = n / totalFrames; // 0 a 1
  const eased = easeInOut(progress);
  el.style.opacity = eased;
};
```

### 3. Cenas com Múltiplas Páginas (Timeline)

```javascript
window.setFrame = function(n) {
  const t = n / 30; // segundos

  // Página 1: 0s–5s
  if (t < 5) {
    document.getElementById('pg-1').style.display = 'block';
    document.getElementById('pg-2').style.display = 'none';
    // animações da página 1...
  }
  // Página 2: 5s–15s
  else if (t < 15) {
    document.getElementById('pg-1').style.display = 'none';
    document.getElementById('pg-2').style.display = 'block';
    // animações da página 2...
  }
};
```

### 4. Cursor Animado com Spline Catmull-Rom

```javascript
// Pontos de controle: [tempo_segundos, x, y]
const cursorPath = [
  [0, 960, 540],
  [2, 200, 100],
  [5, 800, 400],
  [8, 960, 540],
];

function catmullRom(p0, p1, p2, p3, t) {
  return 0.5 * (
    (2*p1) +
    (-p0 + p2) * t +
    (2*p0 - 5*p1 + 4*p2 - p3) * t*t +
    (-p0 + 3*p1 - 3*p2 + p3) * t*t*t
  );
}

window.setFrame = function(n) {
  const t = n / 30;
  // Interpola posição do cursor no tempo t...
};
```

### 5. Intro/Outro com Canvas

```javascript
const canvas = document.getElementById('intro-canvas');
const ctx = canvas.getContext('2d');

function drawIntro(t) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1920, 1080);

  const alpha = Math.min(1, t / 1.5); // fade in em 1.5s
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 120px Arial';
  ctx.fillText('MINHA MARCA', 960, 540);
  ctx.globalAlpha = 1;
}

window.setFrame = function(n) {
  const t = n / 30;
  if (t < 3) {
    canvas.style.display = 'block';
    drawIntro(t);
  } else {
    canvas.style.display = 'none';
  }
};
```

---

## Modo Compatibilidade (HTML-Adapter)

Se sua cena **não implementar `window.setFrame`**, o HyperFrame injeta automaticamente um shim que:

- Substitui `Date.now()` e `performance.now()` por um relógio virtual
- Virtualiza `requestAnimationFrame`, `setTimeout` e `setInterval`
- Implementa `window.setFrame(n)` que avança o tempo e drena as filas

Isso permite renderizar cenas existentes que usam animações baseadas em tempo real, sem modificação.

```html
<!-- Cena sem API HyperFrame — funciona via shim automático -->
<script>
  function animate() {
    const t = Date.now() / 1000; // funciona porque Date.now é virtual
    el.style.left = (Math.sin(t) * 100 + 500) + 'px';
    requestAnimationFrame(animate); // drenado frame a frame
  }
  requestAnimationFrame(animate);
</script>
```

---

## Boas Práticas

### ✅ Faça

- **Declare `window.hyperframe`** com fps, durationInFrames, width e height
- **Use `window.hyperframeReady`** para pré-carregar imagens externas
- **Calcule posições a partir de `n` (frame index)**, não de `Date.now()` real
- **Use `crossOrigin = 'anonymous'`** em imagens de domínios externos
- **Teste em viewport 1920×1080** antes de renderizar

### ❌ Evite

- `setInterval` para atualização de UI (use `setFrame` diretamente)
- Imagens em `<img src="...">` de CDNs sem CORS (use preload via `new Image()`)
- Dependência de estado externo (localStorage, cookies) — o Chromium é headless
- Fontes do Google Fonts sem fallback — podem não carregar em headless
- Animações CSS com `transition` (são desabilitadas pelo HyperFrame automaticamente)

---

## Estrutura Recomendada de Cena

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
  </style>

  <script>
    /* 1. Metadados */
    window.hyperframe = {
      fps: 30,
      durationInFrames: 900, // 30 segundos
      width: 1920,
      height: 1080
    };

    /* 2. Pré-carregamento de assets */
    window.hyperframeReady = new Promise(resolve => {
      // ... pré-carregar imagens ...
      resolve();
    });

    /* 3. API de frame */
    window.setFrame = function(n) {
      const t = n / 30; // tempo em segundos
      // ... atualizar DOM ...
    };
  </script>
</head>
<body>
  <!-- Conteúdo da cena -->
</body>
</html>
```

---

## Exemplo Completo: Animação de Texto

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { width:1920px; height:1080px; overflow:hidden;
           background:#111; display:flex; align-items:center; justify-content:center; }
    h1   { font:bold 120px Arial; color:#fff; opacity:0; transform:translateY(40px); }
  </style>
  <script>
    window.hyperframe = { fps:30, durationInFrames:90, width:1920, height:1080 };

    window.setFrame = function(n) {
      const t = n / 30;
      const ease = t < 1 ? (t < 0.5 ? 2*t*t : -1+(4-2*t)*t) : 1;
      const h1 = document.querySelector('h1');
      h1.style.opacity = ease;
      h1.style.transform = `translateY(${(1-ease)*40}px)`;
    };
  </script>
</head>
<body>
  <h1>Olá, HyperFrame!</h1>
</body>
</html>
```

---

## Exemplo Real: Comercial FORTA TECH

O arquivo [Modelos/fortatech-ecommerce-tour.html](../Modelos/fortatech-ecommerce-tour.html) é um exemplo completo de 30s com:

- 3 páginas HTML (homepage, categoria, produto)
- Cursor animado com spline Catmull-Rom
- Painel de carrinho com animação `easeElastic`
- Modal de confirmação
- Canvas de intro/outro com logo
- Preload de 6 imagens do CDN Shopify
- HUD (barra de progresso)

---

← [CLI](./cli.md) | → [Contribuindo](./contributing.md)
