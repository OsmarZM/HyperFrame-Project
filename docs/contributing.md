# Contribuindo com o HyperFrame

← [Autoria de Cenas](./scene-authoring.md) | → [README](./README.md)

---

## Setup do Ambiente

### Requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | v20.0.0 |
| npm | v10.0.0 |
| TypeScript | v5.4 (instalado via devDependencies) |

### Instalação

```bash
git clone https://github.com/FortaTech/hyperframe.git
cd hyperframe
npm install
npm run build
```

### Modo desenvolvimento (watch)

```bash
npm run dev
# TypeScript fica assistindo mudanças e recompilando automaticamente
```

---

## Estrutura de Diretórios

```
hyperframe/
├── src/                   ← Código-fonte TypeScript
│   ├── types.ts           ← Interfaces e tipos compartilhados
│   ├── index.ts           ← Ponto de entrada da biblioteca
│   ├── cli/
│   │   └── index.ts       ← CLI (Commander)
│   ├── core/
│   │   ├── orchestrator.ts    ← Pipeline principal
│   │   ├── renderer.ts        ← Captura Puppeteer
│   │   ├── encoder.ts         ← FFmpeg
│   │   ├── worker-pool.ts     ← worker_threads
│   │   ├── render-worker.ts   ← Código do worker
│   │   ├── scene-loader.ts    ← Resolução de URL/arquivo
│   │   ├── html-adapter.ts    ← Shim de compatibilidade
│   │   ├── partition.ts       ← Divisão de frames
│   │   └── config.ts          ← Configuração padrão/merge
│   └── server/
│       ├── index.ts           ← Servidor Fastify
│       ├── db.ts              ← Persistência JSON de jobs
│       └── preview.ts         ← Preview em tempo real
│
├── dist/                  ← Compilado (gerado por tsc, não commitar)
├── docs/                  ← Documentação
├── Modelos/               ← Cenas de exemplo e produção
├── examples/              ← Exemplos simples
├── public/                ← Web UI
├── storage/               ← Jobs persistidos (gerado em runtime)
├── output/                ← Vídeos gerados (gerado em runtime)
├── package.json
└── tsconfig.json
```

---

## Scripts npm

| Script | Comando | Descrição |
|---|---|---|
| `build` | `tsc` | Compila TypeScript → `dist/` |
| `dev` | `tsc --watch` | Compila em modo watch |
| `start` | `node dist/cli/index.js` | Executa o CLI compilado |
| `lint` | `eslint src --ext .ts` | Verifica estilo do código |

---

## Convenções de Código

### TypeScript

- **Strict mode** ativado (`"strict": true` no `tsconfig.json`)
- Evitar `any` explícito — usar tipos genéricos ou `unknown`
- Interfaces com `I` prefix são **desnecessárias** (não usamos)
- Exportar apenas o que for necessário para o consumidor

### Nomenclatura

| Item | Convenção | Exemplo |
|---|---|---|
| Arquivos | kebab-case | `render-worker.ts` |
| Funções | camelCase | `renderFrames()` |
| Interfaces | PascalCase | `RenderJob` |
| Constantes | UPPER_SNAKE | `MAX_TIMER_FIRES` |

### Comentários

- JSDoc em funções/interfaces públicas exportadas
- Comentários inline apenas para lógica não-óbvia
- Evitar comentários redundantes (`// incrementa i` antes de `i++`)

---

## Adicionando um Novo Módulo ao Core

1. Criar o arquivo em `src/core/meu-modulo.ts`
2. Exportar a função principal
3. Importar no `orchestrator.ts` se faz parte do pipeline
4. Adicionar o tipo correspondente em `src/types.ts` se necessário
5. Compilar e testar: `npm run build`

---

## Configuração do TypeScript

```json
// tsconfig.json relevante
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  }
}
```

---

## Adicionando uma Nova Rota à API

Em `src/server/index.ts`:

```typescript
// GET /jobs/:id/frames
app.get('/jobs/:id/frames', async (req, reply) => {
  const { id } = req.params as { id: string };
  const job = getJob(id);
  if (!job) return reply.code(404).send({ error: 'Not found' });
  // ...
  return reply.send({ frames: [] });
});
```

---

## Rodando os Exemplos

```bash
# Bouncing ball (exemplo incluído)
node dist/cli/index.js render examples/bouncing-ball/index.html \
  -o output/bouncing-ball.mp4

# Comercial FORTA TECH
node dist/cli/index.js render Modelos/fortatech-ecommerce-tour.html \
  -o output/fortatech-comercial-2026.mp4
```

---

## Testando o Servidor

```bash
# Terminal 1: iniciar servidor
node dist/cli/index.js serve

# Terminal 2: submeter job
node upload-job.js

# Terminal 3: monitorar
curl http://localhost:3002/jobs/<job-id>
```

---

## Problemas Comuns

### `Cannot find module 'dist/cli.js'`
O entry point é `dist/cli/index.js`, não `dist/cli.js`.
```bash
node dist/cli/index.js serve  ✅
node dist/cli.js serve        ❌
```

### Puppeteer trava num frame
Aumentar `protocolTimeout` em `src/core/renderer.ts`:
```typescript
protocolTimeout: 300_000 // 5 minutos
```

### EPERM ao salvar jobs no Windows
`src/server/db.ts` usa `fs.writeFileSync` direto (sem tmp→rename) para evitar permissões no Windows.

### Imagens não carregam em cenas
- Adicionar `crossOrigin = 'anonymous'` nas imagens
- Pré-carregar via `window.hyperframeReady`
- Verificar se o CDN tem CORS configurado

---

← [Autoria de Cenas](./scene-authoring.md) | → [README](./README.md)
