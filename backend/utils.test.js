import { describe, it, expect } from 'vitest'
import { normalizeServerUrl, buildHeaders } from './utils.js'

describe('utils', () => {
    describe('normalizeServerUrl', () => {
        it('should add https:// if missing', () => {
            expect(normalizeServerUrl('n8n.example.com')).toBe('https://n8n.example.com')
        })

        it('should keep http:// if present', () => {
            expect(normalizeServerUrl('http://n8n.example.com')).toBe('http://n8n.example.com')
        })

        it('should remove trailing slash', () => {
            expect(normalizeServerUrl('https://n8n.example.com/')).toBe('https://n8n.example.com')
            expect(normalizeServerUrl('n8n.example.com/')).toBe('https://n8n.example.com')
        })

        it('should trim whitespace', () => {
            expect(normalizeServerUrl('  https://n8n.example.com  ')).toBe('https://n8n.example.com')
        })
    })

    describe('buildHeaders', () => {
        it('should return correct headers', () => {
            const apiKey = 'test-key'
            const headers = buildHeaders(apiKey)
            expect(headers).toEqual({
                'Content-Type': 'application/json',
                'X-N8N-API-KEY': apiKey,
            })
        })
    })
})
