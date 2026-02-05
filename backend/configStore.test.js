import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// Set encryption key before importing configStore
const testKey = crypto.randomBytes(32).toString('hex')
process.env.BACKEND_ENCRYPTION_KEY = testKey
process.env.CONFIG_DB_PATH = ':memory:' // Use in-memory DB for tests

const { setConfig, getConfig, hasConfig, clearConfig } = await import('./configStore.js')

describe('configStore', () => {
    it('should start without config', () => {
        expect(hasConfig()).toBe(false)
        expect(getConfig()).toBe(null)
    })

    it('should save and retrieve config', () => {
        const serverUrl = 'https://n8n.example.com'
        const apiKey = 'test-api-key'

        setConfig(serverUrl, apiKey)

        expect(hasConfig()).toBe(true)
        const stored = getConfig()
        expect(stored.serverUrl).toBe(serverUrl)
        expect(stored.apiKey).toBe(apiKey)
        expect(stored.updatedAt).toBeDefined()
    })

    it('should update existing config', () => {
        const serverUrl = 'https://n8n-new.example.com'
        const apiKey = 'new-api-key'

        setConfig(serverUrl, apiKey)

        const stored = getConfig()
        expect(stored.serverUrl).toBe(serverUrl)
        expect(stored.apiKey).toBe(apiKey)
    })

    it('should clear config', () => {
        clearConfig()
        expect(hasConfig()).toBe(false)
        expect(getConfig()).toBe(null)
    })
})
