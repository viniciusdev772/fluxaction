# Flux Action

Flux Action é um gerenciador web de nível empresarial para fluxos do n8n. Interface moderna para listar, ativar/desativar e baixar fluxos, com backend seguro fazendo proxy para a API do n8n.

## Destaques

- **Segurança Enterprise**: Credenciais criptografadas (AES-256-GCM), proteção CSRF, rate limiting, CSP
- **Monitoramento**: Logs estruturados com Winston, métricas Prometheus, health checks
- **Proteção contra ataques**: SSRF, XSS, SQL injection, path traversal
- **UI Responsiva**: Paginação, busca, filtros, tema claro/escuro
- **PWA**: Funciona offline, instalação na área de trabalho
- **Dockerizado**: Deployment simplificado com Docker Compose

## Arquitetura

- `frontend/`: Vite + React + TypeScript (PWA)
- `backend/`: Express + Winston + SQLite (API proxy seguro)
- `proxy/`: Nginx reverse proxy com HTTPS
- `docker-compose.yml`: Orquestração completa

## Deploy Rápido

### 1. Gerar chave de criptografia

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configurar ambiente

```bash
cp .env.example .env
# Edite .env com sua chave e configurações
```

### 3. Iniciar

```bash
docker compose up --build -d
```

Acesse: `http://localhost:8080`

> [!IMPORTANT]
> Windows: Se encontrar `ERR_DLOPEN_FAILED`, delete as pastas `node_modules` locais. O Docker usa volumes isolados.

## Variáveis de Ambiente

### Obrigatórias

```bash
BACKEND_ENCRYPTION_KEY=<64-caracteres-hex>  # Chave AES-256
NODE_ENV=production                           # ou development
ALLOWED_ORIGINS=https://seu-dominio.com      # CORS
```

### Configurações de Segurança

```bash
RATE_LIMIT_GENERAL=100        # Requisições por 15min
RATE_LIMIT_CONFIG=10          # Tentativas de config
CSRF_PROTECTION=true          # Proteção CSRF
SYNC_INTERVAL_MINUTES=5       # Sincronização
REQUEST_TIMEOUT_MS=30000      # Timeout n8n
MAX_SEARCH_LENGTH=200         # Tamanho máximo busca
```

### Logging

```bash
LOG_LEVEL=info                # debug, info, warn, error
LOG_FILE_PATH=/app/logs/fluxaction.log  # Opcional
```

Veja `.env.example` para lista completa.

## Endpoints da API

### Gerenciamento
- `GET /api/health` - Health check com uptime
- `GET /api/metrics` - Métricas Prometheus
- `GET /api/csrf-token` - Token CSRF

### Configuração
- `GET /api/config` - Status da configuração
- `POST /api/config` - Salvar credenciais
- `DELETE /api/config` - Limpar credenciais

### Workflows
- `POST /api/v1/workflows` - Listar (paginado)
- `GET /api/v1/workflows/:id` - Detalhes
- `POST /api/v1/workflows/:id/activate` - Ativar
- `POST /api/v1/workflows/:id/deactivate` - Desativar

## Segurança

### Implementado
- ✅ **Criptografia**: AES-256-GCM para credenciais em repouso
- ✅ **Rate Limiting**: Proteção contra brute force
- ✅ **CSRF**: Tokens em todas operações de escrita
- ✅ **CSP**: Content Security Policy via Helmet
- ✅ **CORS**: Origens configuráveis
- ✅ **SSRF**: Bloqueio de IPs privados
- ✅ **Validação**: Regex para IDs, limites de tamanho
- ✅ **Timeouts**: Prevenção contra conexões travadas
- ✅ **HSTS**: HTTP Strict Transport Security
- ✅ **Non-root**: Containers executam como usuário não-privilegiado

### Headers de Segurança
```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: default-src 'self'
```

## HTTPS em Produção

1. Obtenha certificados SSL (Let's Encrypt ou comercial)
2. Copie para `proxy/ssl/`
3. Descomente o bloco HTTPS em `proxy/nginx.conf`
4. Atualize `ALLOWED_ORIGINS` com HTTPS
5. Redeploy: `docker compose up -d`

## Desenvolvimento

### App Completo
```bash
npm install
npm run dev       # Frontend em http://localhost:5173 + backend com nodemon em http://localhost:4000
```

O script da raiz inicia o Vite no frontend e o backend com `nodemon` para hot reload.

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run build
```

### Backend
```bash
cd backend
npm install
npm run test       # 40 testes automatizados
npm run test -- --watch
npm run test -- --coverage
npm run dev        # Requer BACKEND_ENCRYPTION_KEY
```

### Testes
```bash
cd backend
npm run test
```

Cobertura de testes:
- SSRF protection
- Rate limiting
- CSRF validation
- Workflow ID validation
- Error sanitization
- Config operations
- Proxy endpoints

## Monitoramento

### Health Checks
Docker Compose inclui health checks para todos os serviços:
- Backend: `/api/health`
- Frontend: Porta 80
- Proxy: `/api/health`

### Logs
```bash
# Logs em tempo real
docker compose logs -f backend

# Logs estruturados (JSON)
docker compose logs backend | jq
```

### Métricas Prometheus
```bash
curl http://localhost:8080/api/metrics
```

Métricas disponíveis:
- `fluxaction_requests_total`
- `fluxaction_n8n_requests_total`
- `fluxaction_n8n_errors_total`
- `fluxaction_sync_operations_total`
- `fluxaction_sync_errors_total`

## Troubleshooting

### Erro de binário no Windows
Delete `node_modules` locais. Docker usa volumes isolados.

### Erro CSRF
Frontend precisa obter token em `/api/csrf-token` antes de POST/DELETE.

### Timeout ao conectar n8n
Verifique `REQUEST_TIMEOUT_MS` e conectividade com servidor n8n.

### Rate limit exceeded
Aguarde 15 minutos ou ajuste `RATE_LIMIT_*` variáveis.

## Stack Tecnológico

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite PWA
- **Backend**: Node.js 20, Express, Winston, better-sqlite3
- **Proxy**: Nginx, SSL/TLS, HTTP/2
- **Segurança**: Helmet, csurf, express-rate-limit
- **Testes**: Vitest, Supertest
- **Deploy**: Docker, Docker Compose

## Contribuição

1. Faça fork do projeto
2. Crie branch: `git checkout -b feature/nova-feature`
3. Commit: `git commit -am 'Adiciona nova feature'`
4. Push: `git push origin feature/nova-feature`
5. Abra Pull Request

## Licença

MIT. Veja `LICENSE.md`.
