# Our Sacred Place

App privado de mensagens só para o Miguel e a Neyma. Estilo WhatsApp, em tom rosa, com bloqueio por senha a cada abertura, visto/não visto, visualização única, status, áudio, foto, offline e instalável como PWA.

**Sem servidor. Sem Render. Sem nada para configurar.** É só abrir o link.

## Como funciona (para curiosos)

- **App**: só ficheiros estáticos (Vite + React), hospedados de graça no **GitHub Pages** deste repo.
- **Mensagens**: viajam entre os dois telemóveis por um **broker MQTT público e gratuito** (sem contas), sempre **cifradas ponta-a-ponta** (AES-GCM). O broker nunca vê o conteúdo.
- **Histórico**: guardado em cada telemóvel (IndexedDB). Ao voltarem a estar os dois online, sincroniza o que faltou.
- **Media**: fotos comprimidas e áudios vão cifrados pelo próprio canal e ficam só no telemóvel. A visualização única apaga-se depois de vista.

## Utilizadores (fixos, em `client/src/lib/config.js`)

| Utilizador | Número | Palavra-passe |
|---|---|---|
| Miguel | `867272348` | `Neyma` |
| Neyma  | `840532528` | `Miguel` |

O app pede a palavra-passe **todas as vezes que abre**.

## Deploy na Vercel (recomendado)

1. Entra em https://vercel.com com a tua conta GitHub.
2. **Add New… → Project** → importa o repo `Neyma-Miguel-`.
3. Não mexas em nada (a Vercel deteta Vite sozinha) → **Deploy**.
4. Ficas com um link `https://<nome>.vercel.app`. Abre nos dois telemóveis →
   menu ⋮ → **Adicionar ao ecrã principal** → ícone rosa `OSP`.

## Desenvolvimento local

```bash
npm install
npm run dev
```
Abre http://localhost:5173 em dois navegadores (ou um normal + um anónimo) e entra com cada conta.

## Funcionalidades

- Texto, áudio (segurar o microfone), foto (câmera/galeria)
- Visualização única (apaga depois de vista)
- Status estilo WhatsApp (expiram em 24h)
- **Visto/não visto**: ✓ enviado · ✓✓ entregue · ✓✓ azul lido + "Visto às HH:MM"
- "a escrever…" e online/offline
- Fila offline: escreve sem internet, envia sozinho quando voltar
- 3 temas: Rosa Confidencial, Roxo Íntimo, Meia-Noite
- Bloqueio por senha em cada abertura

## Notas

- O "correio" é um broker público gratuito, com várias reservas automáticas. As conversas vão sempre cifradas. Muito raramente pode haver instabilidade momentânea — reconecta sozinho.
- Para trocar as palavras-passe: editar `client/src/lib/config.js` e fazer commit (o deploy refaz-se sozinho).
