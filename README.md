# Tracking Packages

Aplicação completa para rastreamento de encomendas (packages/parcels) com interface web moderna, API REST, WebSocket, base de dados SQLite e suporte a múltiplas transportadoras.

## Funcionalidades

- **Multi-transportadora**: UPS, FedEx, USPS, DHL, TNT, Amazon, CTT, Correios, La Poste, Royal Mail, Cainiao, 17Track (agregador).
- **Auto-detecção** da transportadora a partir do número de tracking.
- **Dashboard** com estatísticas, encomendas recentes, barras por transportadora e feed de atividade.
- **Gestão de encomendas**: adicionar (individual ou em massa), editar, arquivar, eliminar, notas.
- **Refresh** individual ou em massa, com atualização em tempo real via WebSocket.
- **Scanner de texto/email**: deteta automaticamente números de tracking em texto colado.
- **Mapa de rota** com localização atual e histórico de eventos.
- **Alertas/notificações**: por estado, entrega, exceção, ETA; canais email/webhook/navegador.
- **Estatísticas**: por transportadora, estado, tempos de entrega.
- **Exportação** JSON e CSV.
- **Definições**: tema claro/escuro, chaves API, auto-refresh.
- **Persistência** SQLite (node:sqlite) com WAL.
- **API REST** completa + WebSocket.
- **Auto-refresh periódico** (30 min) de encomendas ativas.
- **Integração com APIs reais** quando chaves configuradas (17Track, TrackingMore, FedEx, UPS, DHL), com fallback para scraping da página pública da transportadora.

## Instalação

```bash
npm install
cp .env.example .env
# edite .env com as suas chaves API (opcional)
npm start
```

Aceda a http://localhost:4200

## Estrutura

- `server.js` — servidor Express + WebSocket + API REST
- `db.js` — persistência SQLite
- `carriers.js` — transportadoras, detecção, URLs, scanner
- `tracker.js` — providers de tracking (APIs + fallback)
- `public/` — frontend (HTML/CSS/JS)

## Variáveis de ambiente

Ver `.env.example`.

## Licença

MIT
