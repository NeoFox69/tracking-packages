# 📦 Tracking Packages

Aplicação completa de rastreamento de encomendas com interface web moderna, API REST, WebSocket, SQLite e suporte a 12 transportadoras. Pronta para Docker Compose e deploy via Portainer com Git/GHCR.

## 🚀 Deploy rápido (Portainer — recomendado)

A imagem é publicada automaticamente no GitHub Container Registry (GHCR) a cada push na branch `main`.

1. No Portainer: **Stacks → Add stack**
2. Nome: `tracking-packages`
3. **Build method: Web editor**
4. Cole o conteúdo de [`portainer-stack.yml`](portainer-stack.yml)
5. (Opcional) Preencha as chaves API nas `environment`
6. **Deploy the stack**

Aceda a `http://<servidor>:4200`

> O stack usa `ghcr.io/neofox69/tracking-packages:latest`. Se o repo for privado, adicione as credenciais GHCR em **Registries** (username = seu username GitHub, password = um PAT com escopo `read:packages`).

### Atualizar via Git (Portainer Git stack)

Em alternativa, use **Repository** no Portainer:

- **Repository URL:** `https://github.com/NeoFox69/tracking-packages.git`
- **Reference:** `refs/heads/main`
- **Compose file:** `docker-compose.yml`
- Ative **Auto update** para redeploy automático quando fizer push.

O `docker-compose.yml` faz build local a partir do Dockerfile — ideal quando o Portainer corre no mesmo servidor com o repositório clonado. Para usar a imagem pré-construída, use `portainer-stack.yml`.

## 🐳 Docker Compose (local / servidor)

```bash
git clone https://github.com/NeoFox69/tracking-packages.git
cd tracking-packages
cp .env.example .env
docker compose up -d --build
```

Aceda a `http://localhost:4200`. Os dados ficam no volume `tracking-packages-data`.

## ⚙️ Configuração local sem Docker

```bash
npm install
cp .env.example .env
npm start
```

## 🔑 APIs de tracking (opcional)

Sem chaves API a app lê as páginas públicas das transportadoras. Para dados em tempo real, configure no Portainer/.env:

| Variável | Serviço |
|---|---|
| `API_TOKEN_17TRACK` | 17Track (agregador) |
| `TRACKINGMORE_API_KEY` | TrackingMore (agregador) |
| `FEDEX_API_KEY` / `FEDEX_API_SECRET` | Fedex Track API |
| `UPS_CLIENT_ID` / `UPS_CLIENT_SECRET` | UPS Track API |
| `DHL_API_KEY` | DHL Express API |

## ✨ Funcionalidades

- 12 transportadoras (UPS, FedEx, USPS, DHL, TNT, Amazon, CTT, Correios, La Poste, Royal Mail, Cainiao, 17Track) com auto-detecção
- Dashboard com estatísticas, atividade e gráficos por transportadora
- CRUD de encomendas, notas, arquivo, import em massa
- Scanner de texto/email para extrair números de tracking
- Mapa de rota e histórico de eventos (timeline)
- Alertas (estado, entrega, exceção, ETA) via email/webhook/navegador
- Exportação JSON/CSV
- WebSocket + atualização em tempo real e auto-refresh de 30 min
- Tema claro/escuro, persistência SQLite (WAL)

## 🏗️ Estrutura

| Ficheiro | Descrição |
|---|---|
| `server.js` | Servidor Express + WebSocket + API REST |
| `db.js` | Persistência SQLite (node:sqlite) |
| `carriers.js` | Detecção de transportadoras, URLs, scanner |
| `tracker.js` | Providers de tracking (APIs + fallback) |
| `public/` | Frontend (HTML/CSS/JS) |
| `Dockerfile` | Imagem de produção (node:24-alpine) |
| `docker-compose.yml` | Compose local (build) |
| `portainer-stack.yml` | Stack Portainer (imagem GHCR) |
| `.github/workflows/docker-publish.yml` | CI publica imagem no GHCR |

## 📄 Licença

MIT
