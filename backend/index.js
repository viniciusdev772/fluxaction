import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import csrf from 'csurf'
import cookieParser from 'cookie-parser'
import { clearConfig, getConfig, hasConfig, setConfig } from './configStore.js'
import { normalizeServerUrl, buildHeaders } from './utils.js'
import { searchWorkflows, upsertWorkflows, syncDeletedWorkflows } from './workflowStore.js'
import logger, { createRequestLogger } from './logger.js'

const app = express()
const port = process.env.PORT || 4000

// Configuration from environment variables
const CONFIG = {
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5,
  rateLimitGeneral: parseInt(process.env.RATE_LIMIT_GENERAL) || 100,
  rateLimitConfig: parseInt(process.env.RATE_LIMIT_CONFIG) || 10,
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
  maxSearchLength: parseInt(process.env.MAX_SEARCH_LENGTH) || 200,
  csrfProtection: process.env.CSRF_PROTECTION !== 'false', // Enabled by default
}

// Trust proxy (Nginx) to correctly handle X-Forwarded-For header
app.set('trust proxy', 1)

// Security: CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}
app.use(cors(corsOptions))

// Security: Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}))

// Cookie parser for CSRF
app.use(cookieParser())

// Request logging middleware
app.use((req, res, next) => {
  req.logger = createRequestLogger(req)
  req.logger.debug('Request started', { 
    query: req.query,
    body: req.body ? { ...req.body, apiKey: req.body.apiKey ? '[REDACTED]' : undefined } : undefined
  })
  
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    req.logger.info('Request completed', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    })
  })
  
  next()
})

// Security: Rate limiting - configurable requests per window per IP
const limiter = process.env.NODE_ENV === 'test' 
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: CONFIG.rateLimitGeneral,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: 'Muitas requisições deste IP. Tente novamente mais tarde.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    })
app.use(limiter)

// Stricter rate limit for config endpoints
const configLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: CONFIG.rateLimitConfig,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: 'Muitas tentativas de configuração. Tente novamente mais tarde.',
        code: 'CONFIG_RATE_LIMIT_EXCEEDED',
      },
    })

// CSRF protection middleware - disabled in development for easier testing
const csrfProtection = CONFIG.csrfProtection && process.env.NODE_ENV === 'production'
  ? csrf({ cookie: { httpOnly: true, secure: true, sameSite: 'strict' } })
  : (req, res, next) => next()

app.use(compression())
app.use(express.json({ limit: '1mb' }))

// Security: SSRF Protection - Block internal IP ranges
const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
  '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.', '169.254.',
]

const isBlockedHost = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return BLOCKED_HOSTS.some(blocked => 
      hostname === blocked || hostname.startsWith(blocked)
    )
  } catch {
    return true
  }
}

// Security: Sanitize error responses to prevent information leakage
const sanitizeError = (data) => {
  if (typeof data !== 'object' || data === null) {
    return { message: String(data || 'Erro desconhecido') }
  }
  const { message, code } = data
  return { 
    message: message || 'Erro desconhecido', 
    code: code || 'UNKNOWN_ERROR',
  }
}

// Security: Validate workflow ID format
const WORKFLOW_ID_REGEX = /^[a-zA-Z0-9_-]+$/
const isValidWorkflowId = (id) => {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && WORKFLOW_ID_REGEX.test(id)
}

// Metrics tracking
const metrics = {
  requestsTotal: 0,
  requestsByEndpoint: {},
  syncOperations: 0,
  syncErrors: 0,
  n8nRequests: 0,
  n8nErrors: 0,
}

const trackMetric = (endpoint, status) => {
  metrics.requestsTotal++
  if (!metrics.requestsByEndpoint[endpoint]) {
    metrics.requestsByEndpoint[endpoint] = { total: 0, success: 0, error: 0 }
  }
  metrics.requestsByEndpoint[endpoint].total++
  if (status >= 200 && status < 400) {
    metrics.requestsByEndpoint[endpoint].success++
  } else {
    metrics.requestsByEndpoint[endpoint].error++
  }
}

// Fetch from n8n with timeout
const fetchFromN8n = async ({ serverUrl, apiKey, path, method = 'GET', body, reqLogger }) => {
  if (isBlockedHost(serverUrl)) {
    return {
      ok: false,
      status: 400,
      data: { 
        message: 'URL do servidor não permitida', 
        code: 'BLOCKED_HOST' 
      },
    }
  }

  const baseUrl = `${normalizeServerUrl(serverUrl)}/api/v1`
  const url = `${baseUrl}${path}`

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
    reqLogger?.warn('Request timeout', { url: url.replace(/\/api\/v1.*/, '/api/v1/***'), timeout: CONFIG.requestTimeoutMs })
  }, CONFIG.requestTimeoutMs)

  try {
    metrics.n8nRequests++
    
    const response = await fetch(url, {
      method,
      headers: buildHeaders(apiKey),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      metrics.n8nErrors++
      const errorPayload = typeof data === 'string'
        ? { message: data || response.statusText }
        : { message: data?.message || data?.error || response.statusText, code: data?.code }

      reqLogger?.warn('n8n request failed', { status: response.status, path })

      return {
        ok: false,
        status: response.status,
        data: sanitizeError(errorPayload),
      }
    }

    return {
      ok: true,
      status: response.status,
      data,
    }
  } catch (error) {
    clearTimeout(timeout)
    metrics.n8nErrors++
    
    if (error.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        data: { message: 'Timeout ao conectar com n8n', code: 'N8N_TIMEOUT' }
      }
    }
    
    reqLogger?.error('n8n request error', { error: error.message, path })
    throw error
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() })
})

// Prometheus metrics endpoint
app.get('/api/metrics', (req, res) => {
  const lines = [
    '# HELP fluxaction_requests_total Total number of requests',
    '# TYPE fluxaction_requests_total counter',
    `fluxaction_requests_total ${metrics.requestsTotal}`,
    '',
    '# HELP fluxaction_n8n_requests_total Total number of n8n API requests',
    '# TYPE fluxaction_n8n_requests_total counter',
    `fluxaction_n8n_requests_total ${metrics.n8nRequests}`,
    '',
    '# HELP fluxaction_n8n_errors_total Total number of n8n API errors',
    '# TYPE fluxaction_n8n_errors_total counter',
    `fluxaction_n8n_errors_total ${metrics.n8nErrors}`,
    '',
    '# HELP fluxaction_sync_operations_total Total number of sync operations',
    '# TYPE fluxaction_sync_operations_total counter',
    `fluxaction_sync_operations_total ${metrics.syncOperations}`,
    '',
    '# HELP fluxaction_sync_errors_total Total number of sync errors',
    '# TYPE fluxaction_sync_errors_total counter',
    `fluxaction_sync_errors_total ${metrics.syncErrors}`,
  ]
  
  Object.entries(metrics.requestsByEndpoint).forEach(([endpoint, stats]) => {
    lines.push(
      '',
      `# HELP fluxaction_requests_by_endpoint_total Total requests for ${endpoint}`,
      '# TYPE fluxaction_requests_by_endpoint_total counter',
      `fluxaction_requests_by_endpoint_total{endpoint="${endpoint}",status="success"} ${stats.success}`,
      `fluxaction_requests_by_endpoint_total{endpoint="${endpoint}",status="error"} ${stats.error}`,
    )
  })
  
  res.set('Content-Type', 'text/plain')
  res.send(lines.join('\n'))
})

const syncWorkflows = async () => {
  const stored = getConfig()
  if (!stored) return

  const { serverUrl, apiKey } = stored
  metrics.syncOperations++
  
  try {
    let cursor = null
    const allIds = []

    do {
      const params = new URLSearchParams({ limit: '250' })
      if (cursor) params.set('cursor', cursor)

      const result = await fetchFromN8n({
        serverUrl,
        apiKey,
        path: `/workflows?${params.toString()}`,
        reqLogger: logger,
      })

      if (!result.ok) {
        logger.warn('Sync failed to fetch workflows', { status: result.status, code: result.data?.code })
        break
      }

      const items = result.data.data || []
      upsertWorkflows(items)
      allIds.push(...items.map(w => w.id))
      cursor = result.data.nextCursor
    } while (cursor)

    if (allIds.length > 0) {
      syncDeletedWorkflows(allIds)
    }
    
    logger.info(`Sync completed`, { workflowCount: allIds.length })
  } catch (error) {
    metrics.syncErrors++
    logger.error('Sync error', { error: error.message })
  }
}

const startSyncLoop = () => {
  const SYNC_INTERVAL = CONFIG.syncIntervalMinutes * 60 * 1000
  
  logger.info('Starting sync loop', { intervalMinutes: CONFIG.syncIntervalMinutes })
  
  syncWorkflows()
  setInterval(syncWorkflows, SYNC_INTERVAL)
}

app.get('/api/config', (req, res) => {
  trackMetric('get_config', res.statusCode)
  res.json({ configured: hasConfig() })
})

app.get('/api/v1/config', (req, res) => {
  trackMetric('get_config', res.statusCode)
  res.json({ configured: hasConfig() })
})

const configBodyLimit = express.json({ limit: '10kb' })

app.post('/api/config', configLimiter, configBodyLimit, csrfProtection, (req, res) => {
  trackMetric('post_config', res.statusCode)
  
  const { serverUrl, apiKey } = req.body || {}

  if (!serverUrl || !apiKey) {
    req.logger.warn('Missing credentials')
    return res.status(400).json({
      message: 'serverUrl e apiKey são obrigatórios',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const normalizedUrl = normalizeServerUrl(serverUrl)
  
  if (isBlockedHost(normalizedUrl)) {
    req.logger.warn('Blocked host attempt', { serverUrl: normalizedUrl })
    return res.status(400).json({
      message: 'URL do servidor não permitida',
      code: 'BLOCKED_HOST',
    })
  }

  setConfig(normalizedUrl, apiKey)
  syncWorkflows()
  
  req.logger.info('Configuration saved')

  return res.json({ ok: true })
})

app.post('/api/v1/config', configLimiter, configBodyLimit, csrfProtection, (req, res) => {
  trackMetric('post_config', res.statusCode)
  
  const { serverUrl, apiKey } = req.body || {}

  if (!serverUrl || !apiKey) {
    req.logger.warn('Missing credentials')
    return res.status(400).json({
      message: 'serverUrl e apiKey são obrigatórios',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const normalizedUrl = normalizeServerUrl(serverUrl)
  
  if (isBlockedHost(normalizedUrl)) {
    req.logger.warn('Blocked host attempt', { serverUrl: normalizedUrl })
    return res.status(400).json({
      message: 'URL do servidor não permitida',
      code: 'BLOCKED_HOST',
    })
  }

  setConfig(normalizedUrl, apiKey)
  syncWorkflows()
  
  req.logger.info('Configuration saved')

  return res.json({ ok: true })
})

app.delete('/api/config', csrfProtection, (req, res) => {
  trackMetric('delete_config', res.statusCode)
  clearConfig()
  req.logger.info('Configuration cleared')
  return res.status(204).send()
})

app.delete('/api/v1/config', csrfProtection, (req, res) => {
  trackMetric('delete_config', res.statusCode)
  clearConfig()
  req.logger.info('Configuration cleared')
  return res.status(204).send()
})

const workflowBodyLimit = express.json({ limit: '100kb' })

const handleListWorkflows = async (req, res) => {
  trackMetric('list_workflows', res.statusCode)
  
  const stored = getConfig()

  if (!stored) {
    return res.status(400).json({
      message: 'serverUrl e apiKey são obrigatórios',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const { search = '', limit: requestedLimit, offset: requestedOffset = 0, filter = 'all' } = req.body || {}

  if (search && search.length > CONFIG.maxSearchLength) {
    return res.status(400).json({
      message: `Termo de busca muito longo (máximo ${CONFIG.maxSearchLength} caracteres)`,
      code: 'SEARCH_TOO_LONG',
    })
  }

  const validFilters = ['all', 'active', 'inactive']
  if (filter && !validFilters.includes(filter)) {
    return res.status(400).json({
      message: 'Filtro inválido. Use: all, active ou inactive',
      code: 'INVALID_FILTER',
    })
  }

  const limit = Math.min(Number(requestedLimit) || 10, 250)
  const offset = Number(requestedOffset) || 0

  try {
    const { data, total } = searchWorkflows({
      search,
      limit,
      offset,
      filter
    })

    return res.json({
      data,
      total,
      limit,
      offset
    })
  } catch (error) {
    req.logger.error('Error listing workflows', { error: error.message })
    return res.status(500).json({
      message: 'Erro ao buscar workflows no cache local',
      code: 'CACHE_ERROR',
    })
  }
}

const handleActivateWorkflow = async (req, res) => {
  trackMetric('activate_workflow', res.statusCode)
  
  const { id } = req.params

  if (!isValidWorkflowId(id)) {
    return res.status(400).json({
      message: 'ID do workflow inválido',
      code: 'INVALID_WORKFLOW_ID',
    })
  }

  const stored = getConfig()

  if (!stored) {
    return res.status(400).json({
      message: 'serverUrl e apiKey são obrigatórios',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const { serverUrl, apiKey } = stored

  try {
    const result = await fetchFromN8n({
      serverUrl,
      apiKey,
      path: `/workflows/${id}/activate`,
      method: 'POST',
      reqLogger: req.logger,
    })

    if (!result.ok) {
      return res.status(result.status).json(result.data)
    }

    syncWorkflows()
    req.logger.info('Workflow activated', { workflowId: id })
    return res.json(result.data)
  } catch (error) {
    req.logger.error('Error activating workflow', { error: error.message, workflowId: id })
    return res.status(502).json({
      message: 'Falha ao conectar com o servidor n8n',
      code: 'N8N_UNREACHABLE',
    })
  }
}

const handleDeactivateWorkflow = async (req, res) => {
  trackMetric('deactivate_workflow', res.statusCode)
  
  const { id } = req.params

  if (!isValidWorkflowId(id)) {
    return res.status(400).json({
      message: 'ID do workflow inválido',
      code: 'INVALID_WORKFLOW_ID',
    })
  }

  const stored = getConfig()

  if (!stored) {
    return res.status(400).json({
      message: 'serverUrl e apiKey são obrigatórios',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const { serverUrl, apiKey } = stored

  try {
    const result = await fetchFromN8n({
      serverUrl,
      apiKey,
      path: `/workflows/${id}/deactivate`,
      method: 'POST',
      reqLogger: req.logger,
    })

    if (!result.ok) {
      return res.status(result.status).json(result.data)
    }

    syncWorkflows()
    req.logger.info('Workflow deactivated', { workflowId: id })
    return res.json(result.data)
  } catch (error) {
    req.logger.error('Error deactivating workflow', { error: error.message, workflowId: id })
    return res.status(502).json({
      message: 'Falha ao conectar com o servidor n8n',
      code: 'N8N_UNREACHABLE',
    })
  }
}

app.post('/api/v1/workflows', workflowBodyLimit, handleListWorkflows)

app.get('/api/v1/workflows/:id', async (req, res) => {
  trackMetric('get_workflow', res.statusCode)
  
  const { id } = req.params

  if (!isValidWorkflowId(id)) {
    return res.status(400).json({
      message: 'ID do workflow inválido',
      code: 'INVALID_WORKFLOW_ID',
    })
  }

  const stored = getConfig()

  if (!stored) {
    return res.status(400).json({
      message: 'serverUrl e apiKey são obrigatórios',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const { serverUrl, apiKey } = stored

  try {
    const result = await fetchFromN8n({
      serverUrl,
      apiKey,
      path: `/workflows/${id}`,
      reqLogger: req.logger,
    })

    if (!result.ok) {
      return res.status(result.status).json(result.data)
    }

    return res.json(result.data)
  } catch (error) {
    req.logger.error('Error fetching workflow', { error: error.message, workflowId: id })
    return res.status(502).json({
      message: 'Falha ao conectar com o servidor n8n',
      code: 'N8N_UNREACHABLE',
    })
  }
})

app.post('/api/v1/workflows/:id/activate', csrfProtection, handleActivateWorkflow)
app.post('/api/v1/workflows/:id/deactivate', csrfProtection, handleDeactivateWorkflow)

// Global error handler
app.use((err, req, res, _next) => {
  const reqLogger = req.logger || logger
  reqLogger.error('Unhandled error', { error: err.message, stack: err.stack })
  
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      message: 'Token CSRF inválido',
      code: 'CSRF_ERROR',
    })
  }
  
  res.status(500).json({
    message: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
  })
})

export { app }

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info(`Server started`, { port, environment: process.env.NODE_ENV || 'development' })
    startSyncLoop()
  })
}
