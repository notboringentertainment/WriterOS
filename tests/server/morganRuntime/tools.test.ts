import { describe, it, expect } from 'vitest'
import { MORGAN_TOOLS, dispatchTool, RESPOND_TOOL_NAME, READ_CONTEXT_TOOL_NAME } from '../../../server/ai/morganRuntime/tools'
import type { ReachInventory } from '../../../server/ai/morganRuntime/types'

const inventory: ReachInventory = { canSee: ['the logline'], cannotSee: ['pixels'], canDoNow: ['read'], cannotDoYet: ['edit'] }

describe('morgan tools', () => {
  it('exposes exactly the read tool and the terminal respond tool', () => {
    const names = MORGAN_TOOLS.map(t => t.name).sort()
    expect(names).toEqual([READ_CONTEXT_TOOL_NAME, RESPOND_TOOL_NAME].sort())
    for (const t of MORGAN_TOOLS) expect(t.input_schema).toHaveProperty('type', 'object')
  })

  it('dispatches readProjectContext to a continue outcome carrying the inventory', () => {
    const out = dispatchTool({ id: 't1', name: READ_CONTEXT_TOOL_NAME, input: {} }, { inventory })
    expect(out.kind).toBe('continue')
    if (out.kind === 'continue') {
      expect(out.toolUseId).toBe('t1')
      expect(out.content).toMatch(/logline/)
    }
  })

  it('dispatches a valid respond_to_writer to a final result', () => {
    const out = dispatchTool({ id: 't2', name: RESPOND_TOOL_NAME, input: { message: 'Here is the read.', suggestions: ['next'] } }, { inventory })
    expect(out.kind).toBe('final')
    if (out.kind === 'final') {
      expect(out.result.message).toBe('Here is the read.')
      expect(out.result.suggestions).toEqual(['next'])
      expect(out.result.ok).toBe(true)
      expect(out.result.receipts).toEqual([])
    }
  })

  it('rejects respond_to_writer with a blank message as an error outcome (not a hollow pass-through)', () => {
    const out = dispatchTool({ id: 't3', name: RESPOND_TOOL_NAME, input: { message: '' } }, { inventory })
    expect(out.kind).toBe('error')
  })

  it('returns an error outcome for an unknown tool', () => {
    const out = dispatchTool({ id: 't4', name: 'askSpecialist', input: {} }, { inventory })
    expect(out.kind).toBe('error')
  })
})
