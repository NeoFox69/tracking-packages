# 📦 Tracking Packages

Aplicação completa de rastreamento de encomendas com interface web, API REST, WebSocket, SQLite e suporte a 12 transportadoras. Pronta para Docker Compose e Portainer.

🔗 **GitHub:** https://github.com/NeoFox69/tracking-packages

## 🚀 Deploy em 3 passos (Portainer)

### Opção A — Web editor (mais simples)

1. Portainer → **Stacks** → **Add stack**
2. Nome: `tracking-packages` → **Web editor**
3. Cole o conteúdo de [`portainer-stack.yml`](portainer-stack.yml) → **Deploy**
4. Aceda a `http://<seu-servidor>:4200`

> A imagem vem do GitHub Container Registry (GHCR). Se o repo for privado, adicione credenciais em **Registries** (username GitHub + PAT com `read:packages`).

### Opção B — Git stack (build no servidor)

1. Portainer → **Stacks** → **Add stack** → **Repository**
2. Repository URL: `https://github.com/NeoFox69/tracking-packages.git`
3. Reference: `refs/heads/main`
4. Compose file: `docker-compose.yml`
5. Ative **Auto update** para redeploy automático a cada push

## ⚠️ Ativar a publicação automática da imagem (GHCR)

O workflow está no ficheiro [`docker-publish.workflow.yml`](docker-publish.workflow.yml). O token usado para criar o repositório não tem o escopo `workflow`, por isso não pôde ser colocado diretamente em `.github/workflows/`. Para ativar:

**Opção 1 — Pelo site GitHub (recomendado, 30 s):**
1. Abra https://github.com/NeoFox69/tracking-packages
2. Clique em **Add file → Create new file**
3. Em "Name your file" escreva: `.github/workflows/docker-publish.yml` (oGitHub cria as pastas automaticamente)
4. Cole o conteúdo de [`docker-publish.workflow.yml`](docker-publish.workflow.yml)
5. **Commit new file**

**Opção 2 — Clone local e renomeie:**
```bash
git clone https://github.com/NeoFox69/tracking-packages.git
cd tracking-packages
mkdir -p .github/workflows
mv docker-publish.workflow.yml .github/workflows/docker-publish.yml
git add -A && git commit -m "Activate GHCR workflow" && git push
```

Depois disso, cada push em `main` publica `ghcr.io/neofox69/tracking-packages:latest` automaticamente.

> Alternativa sem workflow: use a **Opção B (Git stack)** — o Portainer faz build do `Dockerfile` diretamente, sem precisar de GHCR.

## 🐳 Docker Compose local

```bash
git clone https://github.com/NeoFox69/tracking-packages.git
cd tracking-packages
cp .env.example .env
docker compose up -d --build
```

Dados persistentes no volume `tracking-packages-data`.

## ✨ Funcionalidades

- 12 transportadoras com auto-detecção (UPS, FedEx, USPS, DHL, TNT, Amazon, CTT, Correios, La Poste, Royal Mail, Cainiao, 17Track)
- Dashboard com estatísticas e feed de atividade
- CRUD de encomendas, notas, arquivo, import em massa
- Scanner de texto/email para extrair números
- Mapa de rota e timeline de eventos
- Alertas (email/webhook/navegador) e exportação JSON/CSV
- WebSocket + auto-refresh de 30 min
- Tema claro/escuro, persistência SQLite (WAL)

## 🔑 APIs opcionais

Sem chaves, a app lê as páginas públicas. Para dados em tempo real configure no Portainer/.env: `API_TOKEN_17TRACK`, `TRACKINGMORE_API_KEY`, `FEDEX_API_KEY`/`FEDEX_API_SECRET`, `UPS_CLIENT_ID`/`UPS_CLIENT_SECRET`, `DHL_API_KEY`.

## 📄 Licença

MIT
