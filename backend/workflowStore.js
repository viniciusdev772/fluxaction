import path from 'path'
import Database from 'better-sqlite3'
import fs from 'fs'

const dbPath = process.env.WORKFLOW_DB_PATH
    || path.join(process.cwd(), 'data', 'workflows.sqlite')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)

// Initialize database
db.exec(`
  create table if not exists workflows (
    id text primary key,
    name text not null,
    active integer not null,
    tags text, -- Store as JSON string
    updated_at text not null
  );
  create index if not exists idx_workflows_name on workflows(name);
`)

/**
 * Upsert multiple workflows into the local cache
 * @param {Array} workflows Array of workflow objects from n8n
 */
export const upsertWorkflows = (workflows) => {
    const insert = db.prepare(`
    insert into workflows (id, name, active, tags, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(id) do update set
      name = excluded.name,
      active = excluded.active,
      tags = excluded.tags,
      updated_at = excluded.updated_at
  `)

    const transaction = db.transaction((items) => {
        for (const item of items) {
            insert.run(
                item.id,
                item.name,
                item.active ? 1 : 0,
                JSON.stringify(item.tags || []),
                item.updatedAt || new Date().toISOString()
            )
        }
    })

    transaction(workflows)
}

/**
 * Search workflows in the local cache
 * @param {Object} params { search, limit, offset, filter }
 * @returns {Object} { data, total }
 */
export const searchWorkflows = ({ search = '', limit = 10, offset = 0, filter = 'all' }) => {
    let query = 'select id, name, active, tags, updated_at as updatedAt from workflows'
    let countQuery = 'select count(*) as total from workflows'
    const conditions = []
    const values = []

    if (search) {
        conditions.push('name like ?')
        values.push(`%${search}%`)
    }

    if (filter === 'active') {
        conditions.push('active = 1')
    } else if (filter === 'inactive') {
        conditions.push('active = 0')
    }

    if (conditions.length > 0) {
        const whereClause = ` where ${conditions.join(' and ')}`
        query += whereClause
        countQuery += whereClause
    }

    query += ' order by updated_at desc limit ? offset ?'

    const total = db.prepare(countQuery).get(...values).total
    const data = db.prepare(query).all(...values, limit, offset)

    // Parse tags back to array
    const parsedData = data.map(wf => ({
        ...wf,
        active: wf.active === 1,
        tags: JSON.parse(wf.tags || '[]')
    }))

    return {
        data: parsedData,
        total
    }
}

/**
 * Delete workflows that are no longer present in n8n
 * @param {Array<string>} activeIds IDs currently present in n8n
 */
export const syncDeletedWorkflows = (activeIds) => {
    if (!activeIds || activeIds.length === 0) return

    const placeholders = activeIds.map(() => '?').join(',')
    db.prepare(`delete from workflows where id not in (${placeholders})`).run(...activeIds)
}

export const clearWorkflowCache = () => {
    db.prepare('delete from workflows').run()
}
