import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { upsertWorkflows, searchWorkflows, syncDeletedWorkflows, clearWorkflowCache } from './workflowStore.js'
import fs from 'fs'
import path from 'path'

describe('WorkflowStore', () => {
    beforeEach(() => {
        clearWorkflowCache()
    })

    it('should upsert and retrieve workflows', () => {
        const workflows = [
            { id: '1', name: 'Sync Task', active: true, tags: [{ name: 'dev' }], updatedAt: '2024-01-01' },
            { id: '2', name: 'Backup', active: false, tags: [], updatedAt: '2024-01-02' }
        ]

        upsertWorkflows(workflows)

        const result = searchWorkflows({ search: 'Sync' })
        expect(result.total).toBe(1)
        expect(result.data[0].id).toBe('1')
        expect(result.data[0].active).toBe(true)
        expect(result.data[0].tags).toEqual([{ name: 'dev' }])
    })

    it('should filter by active status', () => {
        const workflows = [
            { id: '1', name: 'A', active: true },
            { id: '2', name: 'B', active: false }
        ]
        upsertWorkflows(workflows)

        const activeBatch = searchWorkflows({ filter: 'active' })
        expect(activeBatch.total).toBe(1)
        expect(activeBatch.data[0].id).toBe('1')

        const inactiveBatch = searchWorkflows({ filter: 'inactive' })
        expect(inactiveBatch.total).toBe(1)
        expect(inactiveBatch.data[0].id).toBe('2')
    })

    it('should sync deleted workflows', () => {
        upsertWorkflows([
            { id: '1', name: 'Keep' },
            { id: '2', name: 'Delete' }
        ])

        syncDeletedWorkflows(['1'])

        const result = searchWorkflows({})
        expect(result.total).toBe(1)
        expect(result.data[0].id).toBe('1')
    })

    it('should handle pagination', () => {
        const workflows = Array.from({ length: 15 }, (_, i) => ({
            id: String(i),
            name: `Workflow ${i}`,
            active: true
        }))

        upsertWorkflows(workflows)

        const page1 = searchWorkflows({ limit: 10, offset: 0 })
        expect(page1.data.length).toBe(10)
        expect(page1.total).toBe(15)

        const page2 = searchWorkflows({ limit: 10, offset: 10 })
        expect(page2.data.length).toBe(5)
    })
})
