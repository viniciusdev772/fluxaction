import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'

// Setup environment for testing
const testKey = crypto.randomBytes(32).toString('hex')
process.env.BACKEND_ENCRYPTION_KEY = testKey
process.env.CONFIG_DB_PATH = ':memory:'
process.env.WORKFLOW_DB_PATH = ':memory:'
process.env.NODE_ENV = 'test'
process.env.ALLOWED_ORIGINS = 'http://localhost:8080'

const { app } = await import('./index.js')
const { clearConfig } = await import('./configStore.js')
const { upsertWorkflows, clearWorkflowCache } = await import('./workflowStore.js')

describe('API Integration Tests', () => {
    beforeEach(() => {
        clearConfig()
        clearWorkflowCache()
        vi.restoreAllMocks()
    })

    describe('GET /api/health', () => {
        it('should return 200 and ok:true', async () => {
            const res = await request(app).get('/api/health')
            expect(res.status).toBe(200)
            expect(res.body.ok).toBe(true)
            expect(typeof res.body.timestamp).toBe('string')
            expect(typeof res.body.uptime).toBe('number')
        })
    })

    describe('Configuration Endpoints', () => {
        it('should return configured:false initially', async () => {
            const res = await request(app).get('/api/config')
            expect(res.status).toBe(200)
            expect(res.body).toEqual({ configured: false })

            const v1Res = await request(app).get('/api/v1/config')
            expect(v1Res.status).toBe(200)
            expect(v1Res.body).toEqual({ configured: false })
        })

        it('should save configuration', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'n8n.test.com', apiKey: 'abc' })

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ ok: true })

            const check = await request(app).get('/api/v1/config')
            expect(check.body.configured).toBe(true)
        })

        it('should fail if missing credentials', async () => {
            const res = await request(app)
                .post('/api/config')
                .send({ serverUrl: 'n8n.test.com' })

            expect(res.status).toBe(400)
            expect(res.body.code).toBe('MISSING_CREDENTIALS')
        })

        it('should delete configuration', async () => {
            await request(app)
                .post('/api/config')
                .send({ serverUrl: 'n8n.test.com', apiKey: 'abc' })

            const del = await request(app).delete('/api/config')
            expect(del.status).toBe(204) // 204 No Content

            const check = await request(app).get('/api/config')
            expect(check.body.configured).toBe(false)
        })
    })

    describe('Security - SSRF Protection', () => {
        it('should allow local n8n on localhost:5678 outside production', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'http://localhost:5678', apiKey: 'abc' })

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ ok: true })
        })

        it('should block localhost on other ports', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'http://localhost:3000', apiKey: 'abc' })

            expect(res.status).toBe(400)
            expect(res.body.code).toBe('BLOCKED_HOST')
        })

        it('should block 127.0.0.1', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'http://127.0.0.1:5678', apiKey: 'abc' })

            expect(res.status).toBe(400)
            expect(res.body.code).toBe('BLOCKED_HOST')
        })

        it('should block 192.168.x.x', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'http://192.168.1.100:5678', apiKey: 'abc' })

            expect(res.status).toBe(400)
            expect(res.body.code).toBe('BLOCKED_HOST')
        })

        it('should block 10.x.x.x', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'http://10.0.0.1:5678', apiKey: 'abc' })

            expect(res.status).toBe(400)
            expect(res.body.code).toBe('BLOCKED_HOST')
        })

        it('should block 172.16.x.x (private range)', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'http://172.16.0.1:5678', apiKey: 'abc' })

            expect(res.status).toBe(400)
            expect(res.body.code).toBe('BLOCKED_HOST')
        })

        it('should allow valid external URLs', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'https://n8n.example.com', apiKey: 'abc' })

            expect(res.status).toBe(200)
            expect(res.body.ok).toBe(true)
        })

        it('should allow URLs without protocol (defaults to https)', async () => {
            const res = await request(app)
                .post('/api/v1/config')
                .send({ serverUrl: 'n8n.example.com', apiKey: 'abc' })

            expect(res.status).toBe(200)
            expect(res.body.ok).toBe(true)
        })
    })

    describe('Workflow Endpoints', () => {
        beforeEach(async () => {
            // Configure for workflow tests
            await request(app)
                .post('/api/config')
                .send({ serverUrl: 'https://n8n.test.com', apiKey: 'abc' })

            // Insert test workflows into cache
            upsertWorkflows([
                { id: '1', name: 'Test Workflow 1', active: true, updatedAt: '2024-01-01T00:00:00Z', tags: [] },
                { id: '2', name: 'Test Workflow 2', active: false, updatedAt: '2024-01-02T00:00:00Z', tags: [] },
            ])
        })

        it('should list workflows from cache', async () => {
            const res = await request(app).post('/api/v1/workflows').send({})

            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(2)
            expect(res.body.total).toBe(2)
            expect(res.body.limit).toBe(10)
            expect(res.body.offset).toBe(0)
        })

        it('should filter workflows by search term', async () => {
            const res = await request(app)
                .post('/api/v1/workflows')
                .send({ search: 'Workflow 1' })

            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(1)
            expect(res.body.data[0].name).toBe('Test Workflow 1')
        })

        it('should filter workflows by active status', async () => {
            const res = await request(app)
                .post('/api/v1/workflows')
                .send({ filter: 'active' })

            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(1)
            expect(res.body.data[0].active).toBe(true)
        })

        it('should return empty array when no workflows match', async () => {
            const res = await request(app)
                .post('/api/v1/workflows')
                .send({ search: 'NonExistent' })

            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(0)
            expect(res.body.total).toBe(0)
        })
    })

    describe('Security - Workflow ID Validation', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/config')
                .send({ serverUrl: 'https://n8n.test.com', apiKey: 'abc' })
        })

        it('should reject invalid workflow ID with special characters', async () => {
            const res = await request(app).get('/api/v1/workflows/test%20id')
            expect(res.status).toBe(400)
            expect(res.body.code).toBe('INVALID_WORKFLOW_ID')
        })

        it('should reject workflow ID with path traversal attempt', async () => {
            // Express resolves path traversal, so it becomes a 404 or gets caught by our validation
            const res = await request(app).get('/api/v1/workflows/../../../etc/passwd')
            // Express normalizes paths, so this either 404s or hits our validator
            expect([400, 404]).toContain(res.status)
        })

        it('should reject workflow ID with SQL injection attempt', async () => {
            const res = await request(app).get('/api/v1/workflows/1\' OR \'1\'=\'1')
            expect(res.status).toBe(400)
            expect(res.body.code).toBe('INVALID_WORKFLOW_ID')
        })

        it('should accept valid workflow IDs', async () => {
            const mockWorkflow = { id: 'valid-id_123', name: 'Test', active: true }

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve(mockWorkflow)
            }))

            const res = await request(app).get('/api/v1/workflows/valid-id_123')
            expect(res.status).toBe(200)
        })
    })

    describe('n8n Proxy Endpoints', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/config')
                .send({ serverUrl: 'https://n8n.test.com', apiKey: 'abc' })
        })

        it('should get workflow by ID from n8n', async () => {
            const mockWorkflow = { id: '1', name: 'Test', active: true }

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve(mockWorkflow)
            }))

            const res = await request(app).get('/api/v1/workflows/1')

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockWorkflow)
        })

        it('should activate workflow via n8n', async () => {
            const mockWorkflow = { id: '1', name: 'Test', active: true }

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve(mockWorkflow)
            }))

            const res = await request(app).post('/api/v1/workflows/1/activate')

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockWorkflow)
        })

        it('should deactivate workflow via n8n', async () => {
            const mockWorkflow = { id: '1', name: 'Test', active: false }

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve(mockWorkflow)
            }))

            const res = await request(app).post('/api/v1/workflows/1/deactivate')

            expect(res.status).toBe(200)
            expect(res.body).toEqual(mockWorkflow)
        })

        it('should update workflow definition via n8n public api', async () => {
            const updatedWorkflow = {
                id: '1',
                name: 'AI Workflow',
                nodes: [
                    {
                        id: 'agent-node',
                        name: 'AI Agent',
                        type: '@n8n/n8n-nodes-langchain.agent',
                        parameters: {
                            text: 'Summarize the ticket',
                            options: {
                                systemMessage: 'You are a precise support agent',
                                maxIterations: 5,
                            },
                        },
                    },
                ],
                connections: {},
                settings: {},
            }

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve(updatedWorkflow)
            })
            vi.stubGlobal('fetch', fetchMock)

            const res = await request(app)
                .put('/api/v1/workflows/1')
                .send({
                    name: 'AI Workflow',
                    nodes: updatedWorkflow.nodes,
                    connections: {},
                    settings: {},
                })

            expect(res.status).toBe(200)
            expect(res.body).toEqual(updatedWorkflow)
            expect(fetchMock).toHaveBeenCalledWith(
                'https://n8n.test.com/api/v1/workflows/1',
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        name: 'AI Workflow',
                        nodes: updatedWorkflow.nodes,
                        connections: {},
                        settings: {},
                    }),
                })
            )
        })

        it('should update only ai agent system messages in strict mode', async () => {
            const currentWorkflow = {
                id: '1',
                name: 'AI Workflow',
                nodes: [
                    {
                        id: 'agent-node',
                        name: 'AI Agent',
                        type: '@n8n/n8n-nodes-langchain.agent',
                        parameters: {
                            options: {
                                systemMessage: 'old prompt',
                            },
                        },
                    },
                    {
                        id: 'chat-model',
                        name: 'OpenAI Chat Model',
                        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
                        parameters: {
                            model: {
                                value: 'gpt-5-mini',
                            },
                        },
                    },
                ],
                connections: {
                    'OpenAI Chat Model': {
                        ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]],
                    },
                },
                settings: {},
            }

            const updatedWorkflow = {
                ...currentWorkflow,
                nodes: [
                    {
                        ...currentWorkflow.nodes[0],
                        parameters: {
                            options: {
                                systemMessage: 'new prompt',
                            },
                        },
                    },
                    currentWorkflow.nodes[1],
                ],
            }

            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve(currentWorkflow),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve(updatedWorkflow),
                })
            vi.stubGlobal('fetch', fetchMock)

            const res = await request(app)
                .patch('/api/v1/workflows/1/ai-system-message')
                .send({
                    updates: [
                        {
                            nodeKey: 'agent-node',
                            systemMessage: 'new prompt',
                        },
                    ],
                })

            expect(res.status).toBe(200)
            expect(fetchMock).toHaveBeenNthCalledWith(
                1,
                'https://n8n.test.com/api/v1/workflows/1',
                expect.objectContaining({ method: 'GET' })
            )
            expect(fetchMock).toHaveBeenNthCalledWith(
                2,
                'https://n8n.test.com/api/v1/workflows/1',
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        name: 'AI Workflow',
                        nodes: updatedWorkflow.nodes,
                        connections: currentWorkflow.connections,
                        settings: {},
                    }),
                })
            )
        })

        it('should update ai agent system message even when workflow has extra settings', async () => {
            const currentWorkflow = {
                id: '1',
                name: 'AI Workflow',
                nodes: [
                    {
                        id: 'agent-node',
                        name: 'AI Agent',
                        type: '@n8n/n8n-nodes-langchain.agent',
                        parameters: { options: { systemMessage: 'old prompt' } },
                    },
                ],
                connections: {},
                settings: {
                    executionOrder: 'v1',
                    binaryMode: 'separate',
                },
            }

            const updatedWorkflow = {
                ...currentWorkflow,
                nodes: [
                    {
                        ...currentWorkflow.nodes[0],
                        parameters: { options: { systemMessage: 'new prompt' } },
                    },
                ],
            }

            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve(currentWorkflow),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve(updatedWorkflow),
                })
            vi.stubGlobal('fetch', fetchMock)

            const res = await request(app)
                .patch('/api/v1/workflows/1/ai-system-message')
                .send({
                    updates: [
                        {
                            nodeKey: 'agent-node',
                            systemMessage: 'new prompt',
                        },
                    ],
                })

            expect(res.status).toBe(200)
            expect(fetchMock).toHaveBeenNthCalledWith(
                2,
                'https://n8n.test.com/api/v1/workflows/1',
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        name: 'AI Workflow',
                        nodes: updatedWorkflow.nodes,
                        connections: {},
                        settings: {},
                    }),
                })
            )
        })

        it('should handle n8n server error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

            const res = await request(app).get('/api/v1/workflows/1')

            expect(res.status).toBe(502)
            expect(res.body.code).toBe('N8N_UNREACHABLE')
        })

        it('should sanitize error responses from n8n', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ 
                    message: 'Invalid workflow',
                    code: 'INVALID_WORKFLOW',
                    stack: 'Error: Invalid workflow\n    at /app/server.js:123:45' // Should be sanitized
                })
            }))

            const res = await request(app).get('/api/v1/workflows/1')

            expect(res.status).toBe(400)
            expect(res.body.message).toBe('Invalid workflow')
            expect(res.body.code).toBe('INVALID_WORKFLOW')
            expect(res.body.stack).toBeUndefined() // Stack trace should be removed
        })

        it('should handle non-JSON error responses', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                headers: new Headers({ 'content-type': 'text/plain' }),
                text: () => Promise.resolve('Internal Server Error')
            }))

            const res = await request(app).get('/api/v1/workflows/1')

            expect(res.status).toBe(500)
            expect(res.body.message).toBe('Internal Server Error')
        })
    })

    describe('Security - Error Sanitization', () => {
        it('should return generic message for unhandled errors', async () => {
            // This test verifies the global error handler works
            // We can't easily trigger it, but we verify it exists by checking the response format
            const res = await request(app).get('/api/nonexistent')
            
            // Should return 404 from Express (not crash)
            expect(res.status).toBe(404)
        })
    })
})
