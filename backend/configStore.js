import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import logger from './logger.js'

const loadKey = () => {
  const raw = process.env.BACKEND_ENCRYPTION_KEY
  if (!raw || raw === 'REPLACE_WITH_YOUR_GENERATED_KEY') {
    throw new Error(
      'BACKEND_ENCRYPTION_KEY é obrigatória. ' +
      'Gere uma chave com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }

  const hexKey = raw.trim()
  const isHex = /^[0-9a-fA-F]+$/.test(hexKey)

  const key = isHex ? Buffer.from(hexKey, 'hex') : Buffer.from(raw, 'base64')

  if (key.length !== 32) {
    throw new Error('BACKEND_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hex ou base64)')
  }

  logger.info('Encryption key loaded successfully')
  return key
}

const key = loadKey()

const encryptValue = (value) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`
}

const decryptValue = (payload) => {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Payload criptografado inválido')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}

const dbPath = process.env.CONFIG_DB_PATH
  || path.join(process.cwd(), 'data', 'fluxaction.sqlite')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)
db.exec(`
  create table if not exists config (
    id integer primary key check (id = 1),
    server_url_enc text not null,
    api_key_enc text not null,
    updated_at text not null
  )
`)

const getRow = () => db.prepare('select server_url_enc, api_key_enc, updated_at from config where id = 1').get()

const setRow = (serverUrl, apiKey) => {
  const now = new Date().toISOString()
  const serverUrlEnc = encryptValue(serverUrl)
  const apiKeyEnc = encryptValue(apiKey)

  db.prepare(`
    insert into config (id, server_url_enc, api_key_enc, updated_at)
    values (1, ?, ?, ?)
    on conflict(id) do update set
      server_url_enc = excluded.server_url_enc,
      api_key_enc = excluded.api_key_enc,
      updated_at = excluded.updated_at
  `).run(serverUrlEnc, apiKeyEnc, now)

  return { updatedAt: now }
}

const clearRow = () => {
  db.prepare('delete from config where id = 1').run()
}

export const getConfig = () => {
  const row = getRow()
  if (!row) {
    return null
  }

  try {
    return {
      serverUrl: decryptValue(row.server_url_enc),
      apiKey: decryptValue(row.api_key_enc),
      updatedAt: row.updated_at,
    }
  } catch (error) {
    logger.error('Failed to decrypt configuration', { error: error.message })
    // Corrupted or invalid encryption - clear the config
    clearRow()
    return null
  }
}

export const hasConfig = () => {
  const row = getRow()
  return !!row
}

export const setConfig = (serverUrl, apiKey) => setRow(serverUrl, apiKey)

export const clearConfig = () => clearRow()
