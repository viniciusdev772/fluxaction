# Agent Instructions for Flux Action

Flux Action is an enterprise-grade React + TypeScript + Vite PWA with a production-ready Node/Express backend that proxies requests to the n8n API. Features comprehensive security, monitoring, and logging.

## Project Layout

- `frontend/` - Vite React PWA (TypeScript, Tailwind CSS)
- `backend/` - Express API with Winston logging, SQLite, comprehensive security
- `proxy/` - Nginx reverse proxy with HTTPS/SSL support
- `docker-compose.yml` - Production-ready orchestration with health checks
- `.env.example` - Comprehensive environment configuration

## Quick Start

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Configure environment
cp .env.example .env

# Deploy
docker compose up --build -d
```

## Commands

### Docker (Production)

- **Start**: `docker compose up --build -d`
- **Stop**: `docker compose down`
- **Logs**: `docker compose logs -f backend`
- **Health**: `curl http://localhost:8080/api/health`
- **Metrics**: `curl http://localhost:8080/api/metrics`

### Docker Troubleshooting

- **Binary Mismatch**: Delete local `node_modules/` folders. Docker uses Linux volumes.
- **CSRF Errors**: Frontend must get token from `/api/csrf-token` before POST/DELETE
- **Rate Limits**: Wait 15 minutes or adjust `RATE_LIMIT_*` env vars

### Frontend

```bash
cd frontend
npm install
npm run dev      # Port 5173
npm run build    # Production build
npm run lint     # ESLint check
npm run preview  # Preview production
```

### Backend

```bash
cd backend
npm install
npm run start    # Production
npm run dev      # Development with hot reload
npm run test     # Run all 40 tests
npm run test -- utils.test.js
npm run test -- --watch
npm run test -- --coverage
```

## Environment Variables

### Required

```bash
BACKEND_ENCRYPTION_KEY=<64-char-hex>  # Generate with crypto.randomBytes(32)
NODE_ENV=production                    # or development
ALLOWED_ORIGINS=https://yourdomain.com # CORS origins
```

### Security Configuration

```bash
# Rate Limiting
RATE_LIMIT_GENERAL=100      # Requests per 15min per IP
RATE_LIMIT_CONFIG=10        # Config endpoint limit

# CSRF
CSRF_PROTECTION=true        # Enable CSRF tokens

# Operation Timeouts
SYNC_INTERVAL_MINUTES=5     # Workflow sync frequency
REQUEST_TIMEOUT_MS=30000    # n8n API timeout
MAX_SEARCH_LENGTH=200       # Search query max length
```

### Logging

```bash
LOG_LEVEL=info              # debug, info, warn, error
LOG_FILE_PATH=/app/logs/fluxaction.log  # Optional file output
```

See `.env.example` for complete list.

## Architecture Overview

### Security Stack

| Layer | Implementation |
|-------|---------------|
| Encryption | AES-256-GCM (credentials at rest) |
| Rate Limiting | express-rate-limit (100/15min general, 10/15min config) |
| CSRF | csurf library with secure cookies |
| CORS | Configurable origins |
| CSP | Helmet with strict directives |
| SSRF | Blocked private IP ranges |
| Input Validation | Regex patterns, length limits |
| Headers | HSTS, X-Frame-Options, X-Content-Type-Options, etc. |

### Monitoring Stack

| Component | Implementation |
|-----------|---------------|
| Logging | Winston with JSON format, correlation IDs |
| Metrics | Prometheus endpoint at `/api/metrics` |
| Health | Health checks for all services |
| Tracing | Request IDs in all logs |

### API Endpoints

**Management:**
- `GET /api/health` - Health check with uptime
- `GET /api/metrics` - Prometheus metrics
- `GET /api/csrf-token` - CSRF token for frontend

**Configuration:**
- `GET /api/config` - Check configuration status
- `POST /api/config` - Save credentials (requires CSRF token)
- `DELETE /api/config` - Clear credentials (requires CSRF token)

**Workflows:**
- `POST /api/v1/workflows` - List with pagination/search/filter
- `GET /api/v1/workflows/:id` - Get workflow details
- `POST /api/v1/workflows/:id/activate` - Activate (requires CSRF)
- `POST /api/v1/workflows/:id/deactivate` - Deactivate (requires CSRF)

## TDD Workflow (Mandatory)

All changes must follow Test-Driven Development:

1. **Red**: Write test that fails
2. **Green**: Write minimal code to pass
3. **Refactor**: Clean while keeping tests green

### Testing Guidelines

- **Unit Tests**: `backend/utils.test.js`, `backend/configStore.test.js`
- **Integration Tests**: `backend/index.test.js` with Supertest
- **Mocks**: Use `vi.stubGlobal('fetch', ...)` for n8n API
- **Database**: `:memory:` SQLite for isolation
- **Setup**: Set env vars BEFORE importing modules

### Test Coverage (40 tests)

- SSRF protection (6 tests)
- Rate limiting
- CSRF validation
- Workflow ID validation
- Error sanitization
- Config operations
- Proxy endpoints
- Search/filter functionality

## Code Style Guidelines

### TypeScript

- **Target**: ES2022 (frontend), ES2023 (Node/Vite)
- **Module**: ESNext with `"type": "module"`
- **JSX**: `react-jsx` transform
- **Strict**: Strict null checks, no implicit any
- **Unused**: `noUnusedLocals` and `noUnusedParameters` enabled
- **Imports**: Use `import type` for types only

### Naming

- **Components**: PascalCase (`WorkflowList.tsx`)
- **Hooks**: camelCase with `use` prefix (`useApp.ts`)
- **Utilities**: camelCase (`n8nApi.ts`)
- **Types**: PascalCase (`Workflow`, `ApiError`)
- **Constants**: UPPER_SNAKE_CASE (`PAGE_SIZES`)
- **Backend**: camelCase (`configStore.js`)

### Formatting

```typescript
import { useState } from 'react'
import { useApp } from '../contexts/AppContext'
import { n8nApi } from '../services/n8nApi'
import type { Workflow } from '../types/n8n'
import { WorkflowItem } from './WorkflowItem'
```

- Single quotes
- 2-space indent
- No trailing semicolons
- No blank lines between import groups

### React Patterns

- Functional components with hooks
- `StrictMode` in development
- Contexts for global state (`AppContext.tsx`)
- Custom hooks throw outside provider
- `useCallback` for memoized callbacks
- `useEffect` with cleanup

### Error Handling

- TypeScript strict mode
- Explicit return types for public APIs
- Try/catch for promises
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Portuguese user messages
- Structured backend errors: `{ message, code?, httpStatusCode? }`

### CSS/Tailwind

- Utility-first approach
- No separate CSS files
- `class-variance-authority` for variants
- `clsx` + `tailwind-merge` for conditionals
- Dark/light theme support
- Mobile-first responsive

Common patterns:
```
bg-background, text-foreground     # Theme colors
border-border/40                   # Subtle borders
backdrop-blur                      # Glassmorphism
animate-spin                       # Loading
animate-in fade-in                 # Entrance
```

## Security Implementation Details

### Encryption

```javascript
// AES-256-GCM with authentication tag
const iv = crypto.randomBytes(12)
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
const tag = cipher.getAuthTag()
// Format: iv.tag.ciphertext (base64)
```

### CSRF Protection

```javascript
// Get token
const { data } = await fetch('/api/csrf-token')

// Use in POST/DELETE
fetch('/api/config', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': data.csrfToken,
  },
  credentials: 'include',  // Required for cookies
  body: JSON.stringify({...})
})
```

### SSRF Protection

Blocked hosts:
- localhost, 127.0.0.1, 0.0.0.0, ::1
- 10.x.x.x (private)
- 192.168.x.x (private)
- 172.16-31.x.x (private)
- 169.254.x.x (link-local)

### Rate Limiting

```javascript
// General: 100 req / 15 min
// Config: 10 req / 15 min
// Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

## Logging with Winston

```javascript
import logger from './logger.js'

// Levels: debug, info, warn, error
logger.info('Operation completed', { workflowId: '123' })
logger.error('Failed to sync', { error: err.message })

// Request logger (auto-correlation ID)
req.logger.info('Processing', { detail: 'value' })
```

Log format (production):
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "message": "Request completed",
  "service": "fluxaction-backend",
  "requestId": "req-1234567890-abc123",
  "method": "GET",
  "path": "/api/health",
  "statusCode": 200,
  "duration": "25ms"
}
```

## Prometheus Metrics

Available at `GET /api/metrics`:

```
fluxaction_requests_total 1234
fluxaction_n8n_requests_total 567
fluxaction_n8n_errors_total 12
fluxaction_sync_operations_total 89
fluxaction_sync_errors_total 2
fluxaction_requests_by_endpoint_total{endpoint="list_workflows",status="success"} 400
```

## HTTPS Configuration

1. Obtain SSL certificates
2. Place in `proxy/ssl/`
3. Uncomment HTTPS block in `proxy/nginx.conf`
4. Update `ALLOWED_ORIGINS` in `.env`
5. Deploy: `docker compose up -d`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ERR_DLOPEN_FAILED` | Delete local `node_modules/`
| CSRF errors | Ensure frontend fetches token first |
| Rate limited | Wait 15min or adjust limits |
| Timeout errors | Check `REQUEST_TIMEOUT_MS` |
| Certificate errors | Verify SSL paths in nginx.conf |

## PWA Configuration

- `vite-plugin-pwa` for service worker
- Manifest: `frontend/public/manifest.json`
- Icons: `frontend/public/favicon.svg`
- Theme: `#0f172a`
- Display: `standalone`
- Auto-update enabled

## Backend Architecture

- **Server**: Express with Helmet
- **Compression**: gzip
- **Database**: SQLite (better-sqlite3)
- **Cache**: Workflow cache with 5-min sync
- **Logging**: Winston (JSON)
- **Security**: Multiple layers (see above)
- **Endpoints**: `/api/` and `/api/v1/` prefixes

## Production Checklist

- [ ] Generate unique `BACKEND_ENCRYPTION_KEY`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS`
- [ ] Enable HTTPS with SSL certificates
- [ ] Set up log aggregation (optional)
- [ ] Configure monitoring/alerts
- [ ] Test all endpoints
- [ ] Verify health checks pass
