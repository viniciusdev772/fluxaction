export const normalizeServerUrl = (serverUrl) => {
    const trimmed = serverUrl.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return `https://${trimmed.replace(/\/$/, '')}`
    }
    return trimmed.replace(/\/$/, '')
}

export const buildHeaders = (apiKey) => ({
    'Content-Type': 'application/json',
    'X-N8N-API-KEY': apiKey,
})
