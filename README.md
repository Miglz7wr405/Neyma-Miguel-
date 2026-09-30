# Our Sacred Place

Um app privado de mensagens só para o Miguel e a Neyma. Estilo WhatsApp, mas em tom rosa, com bloqueio por senha a cada abertura, visualização única, status, áudio, foto, offline e instalável como PWA.

## Utilizadores

Os dois logins são fixos (definidos em `server/src/users.ts`):

| Utilizador | Número | Palavra-passe |
|---|---|---|
| Miguel | `867272348` | `Neyma` |
| Neyma  | `840532528` | `Miguel` |

O app **pede a palavra-passe todas as vezes que abre**.

## Desenvolvimento local

Requer Node 18+.

```bash
npm run install:all
npm run dev
```

- Cliente: http://localhost:5173
- Servidor: http://localhost:3001

O Vite faz proxy de `/api` e `/socket.io` para o servidor. Abre `http://localhost:5173` num navegador (Miguel) e noutro em janela anónima ou noutro dispositivo da mesma rede (Neyma).

## Produção

```bash
npm run build
npm start
```

O servidor Node passa a servir o build do Vite em `http://localhost:3001` (uma URL só para tudo).

## Deploy no Render (recomendado)

1. Faz push desta branch para o GitHub.
2. Entra em https://render.com → **New +** → **Blueprint** → aponta para este repo.
3. O ficheiro `render.yaml` cria o Web Service com disco persistente em `/data` (SQLite + ficheiros de mídia).
4. Ao terminar o build a Render devolve uma URL `https://our-sacred-place.onrender.com` — abre no telemóvel dos dois.

Para **instalar como app**: no Chrome do Android, abre a URL → menu ⋮ → **Adicionar ao ecrã principal** → aparece o ícone rosa `OSP`.

## Deploy alternativo (Docker)

```bash
docker build -t osp .
docker run -p 3001:3001 -v $(pwd)/data:/data osp
```

## Trocar as palavras-passe

Edita `server/src/users.ts`, faz commit e re-deploy.

## Funcionalidades

- Texto, áudio (MediaRecorder), foto (câmera ou galeria)
- Visualização única (foto apaga do servidor após primeira abertura)
- Status estilo WhatsApp (expiram em 24h)
- Ticks ✓ (enviado) → ✓✓ (entregue) → ✓✓ azuis (lido)
- Fila offline: envia mensagens escritas sem internet assim que voltar a ligar
- 3 temas: **Rosa Confidencial** (padrão), **Roxo Íntimo**, **Meia-Noite**
- Personalização de perfil (nome apelidado, foto)
- Bloqueio por senha em cada abertura

## Estrutura

```
/                 monorepo raiz
├── server/       Node.js + Express + Socket.IO + SQLite
├── client/       Vite + React + PWA
├── render.yaml   deploy 1-clique
└── Dockerfile    deploy alternativo
```
