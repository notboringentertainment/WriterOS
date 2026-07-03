import { describe, it, expect } from 'vitest'
import { MORGAN_TOOLS, dispatchTool, RESPOND_TOOL_NAME, READ_CONTEXT_TOOL_NAME, ASK_SPECIALIST_TOOL_NAME } from '../../../server/ai/morganRuntime/tools'
import type { ReachInventory } from '../../../server/ai/morganRuntime/types'
import { CALLABLE_SPECIALIST_IDS } from '../../../shared/personas'

const inventory: ReachInventory = { canSee: ['the logline'], cannotSee: ['pixels'], canDoNow: ['read'], cannotDoYet: ['edit'] }
const depsOk = { callSpecialist: async ({ specialistId }: { specialistId: string; question: string }) => ({ message: `read from ${specialistId}` }) }

describe('morgan tools', () => {
  it('exposes read, respond, and askSpecialist — and the askSpecialist enum equals the shared registry', () => {
    const names = MORGAN_TOOLS.map(t => t.name).sort()
    expect(names).toEqual([READ_CONTEXT_TOOL_NAME, RESPOND_TOOL_NAME, ASK_SPECIALIST_TOOL_NAME].sort())
    for (const t of MORGAN_TOOLS) expect(t.input_schema).toHaveProperty('type', 'object')
    const ask = MORGAN_TOOLS.find(t => t.name === ASK_SPECIALIST_TOOL_NAME)!
    const enumVals = ((ask.input_schema as { properties: { specialistId: { enum: string[] } } }).properties.specialistId.enum).slice().sort()
    expect(enumVals).toEqual([...CALLABLE_SPECIALIST_IDS].sort())
  })

  it('respond_to_writer advertises only fields the M1 response path actually carries (no dead receipts/limits)', () => {
    const respond = MORGAN_TOOLS.find(t => t.name === RESPOND_TOOL_NAME)!
    const props = Object.keys((respond.input_schema as { properties: Record<string, unknown> }).properties).sort()
    expect(props).toEqual(['message', 'suggestions'])
  })

  it('dispatches readProjectContext to a continue outcome carrying the inventory', async () => {
    const out = await dispatchTool({ id: 't1', name: READ_CONTEXT_TOOL_NAME, input: {} }, { inventory })
    expect(out.kind).toBe('continue')
    if (out.kind === 'continue') {
      expect(out.toolUseId).toBe('t1')
      expect(out.content).toMatch(/logline/)
    }
  })

  it('dispatches a valid respond_to_writer to a final result', async () => {
    const out = await dispatchTool({ id: 't2', name: RESPOND_TOOL_NAME, input: { message: 'Here is the read.', suggestions: ['next'] } }, { inventory })
    expect(out.kind).toBe('final')
    if (out.kind === 'final') {
      expect(out.result.message).toBe('Here is the read.')
      expect(out.result.suggestions).toEqual(['next'])
      expect(out.result.ok).toBe(true)
      expect(out.result).not.toHaveProperty('receipts')
      expect(out.result).not.toHaveProperty('limits')
    }
  })

  it('enforces the advertised 0-3 suggestions contract in the schema (maxItems 3, non-empty items)', () => {
    const respond = MORGAN_TOOLS.find(t => t.name === RESPOND_TOOL_NAME)!
    const sug = (respond.input_schema as { properties: { suggestions: Record<string, unknown> } }).properties.suggestions
    expect(sug.maxItems).toBe(3)
    expect((sug.items as { minLength?: number }).minLength).toBe(1)
  })

  it('normalizes suggestions at runtime: trims, drops blanks, caps at 3', async () => {
    const out = await dispatchTool(
      { id: 't', name: RESPOND_TOOL_NAME, input: { message: 'ok', suggestions: ['  a  ', '', '   ', 'b', 'c', 'd'] } },
      { inventory },
    )
    expect(out.kind).toBe('final')
    if (out.kind === 'final') {
      expect(out.result.suggestions).toEqual(['a', 'b', 'c'])
    }
  })

  it('rejects respond_to_writer with a blank message as an error outcome (not a hollow pass-through)', async () => {
    const out = await dispatchTool({ id: 't3', name: RESPOND_TOOL_NAME, input: { message: '' } }, { inventory })
    expect(out.kind).toBe('error')
  })

  it('returns an error outcome for an unknown tool', async () => {
    const out = await dispatchTool({ id: 't4', name: 'definitelyNotATool', input: {} }, { inventory })
    expect(out.kind).toBe('error')
  })

  it('askSpecialist: valid specialist + question calls the injected dep, returns a continue outcome with the read', async () => {
    const out = await dispatchTool({ id: 'a1', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'zoe', question: 'world logic?' } }, { inventory, deps: depsOk })
    expect(out.kind).toBe('continue')
    if (out.kind === 'continue') {
      expect(out.toolUseId).toBe('a1')
      expect(out.content).toMatch(/read from zoe/)
      expect(out.consult).toEqual({ specialistId: 'zoe', question: 'world logic?', message: 'read from zoe' })
    }
  })

  it('askSpecialist: rejects writingPartner (Morgan cannot call herself)', async () => {
    const out = await dispatchTool({ id: 'a2', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'writingPartner', question: 'x' } }, { inventory, deps: depsOk })
    expect(out.kind).toBe('error')
  })

  it('askSpecialist: rejects an unknown specialist id', async () => {
    const out = await dispatchTool({ id: 'a3', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'nobody', question: 'x' } }, { inventory, deps: depsOk })
    expect(out.kind).toBe('error')
  })

  it('askSpecialist: rejects a blank question', async () => {
    const out = await dispatchTool({ id: 'a4', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: '   ' } }, { inventory, deps: depsOk })
    expect(out.kind).toBe('error')
  })

  it('askSpecialist: errors honestly when the caller dependency is missing (no fake answer)', async () => {
    const out = await dispatchTool({ id: 'a5', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: 'ok' } }, { inventory })
    expect(out.kind).toBe('error')
  })

  it('askSpecialist: errors honestly when the dependency throws', async () => {
    const depsThrow = { callSpecialist: async () => { throw new Error('provider down') } }
    const out = await dispatchTool({ id: 'a6', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: 'ok' } }, { inventory, deps: depsThrow })
    expect(out.kind).toBe('error')
  })

  it('askSpecialist: traces the underlying dependency failure reason', async () => {
    const events: Array<{ kind: string; reason?: string }> = []
    const depsThrow = { callSpecialist: async () => { throw new Error('provider down') } }
    const out = await dispatchTool(
      { id: 'a7', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: 'ok' } },
      { inventory, deps: depsThrow, runId: 'morgan_test', trace: (event) => events.push(event) },
    )
    expect(out.kind).toBe('error')
    expect(events.find((event) => event.kind === 'askSpecialist.error')).toMatchObject({ reason: 'provider down' })
  })

  it('dispatchTool is async (returns a Promise that resolves to the outcome)', async () => {
    const p = dispatchTool({ id: 't', name: READ_CONTEXT_TOOL_NAME, input: {} }, { inventory })
    expect(p).toBeInstanceOf(Promise)
    expect((await p).kind).toBe('continue')
  })
})
