import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatTraceLine,
  truncatePreview,
  createRunId,
  consoleTraceSink,
  resolveTraceSink,
  deriveRunDebug,
  isDebugApiEnabled,
  type MorganTraceEvent,
} from '../../../server/ai/morganRuntime/trace'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.MORGAN_TRACE
  delete process.env.MORGAN_DEBUG_API
})

describe('truncatePreview', () => {
  it('leaves short strings untouched', () => {
    expect(truncatePreview('short', 120)).toBe('short')
  })
  it('truncates long strings with an ellipsis and caps length', () => {
    const out = truncatePreview('x'.repeat(500), 10)
    expect(out.length).toBe(10)
    expect(out.endsWith('…')).toBe(true)
  })
  it('collapses newlines so a trace line stays single-line', () => {
    expect(truncatePreview('a\nb\r\nc', 120)).toBe('a b c')
  })
})

describe('createRunId', () => {
  it('produces a morgan-prefixed, unique id', () => {
    const a = createRunId()
    const b = createRunId()
    expect(a).toMatch(/^morgan_[a-z0-9]+$/i)
    expect(a).not.toBe(b)
  })
})

describe('formatTraceLine', () => {
  const cases: Array<[MorganTraceEvent, RegExp]> = [
    [{ kind: 'run.started', runId: 'morgan_x', personaId: 'writingPartner' }, /^\[morgan\] run=morgan_x start persona=writingPartner$/],
    [{ kind: 'askSpecialist.started', runId: 'morgan_x', specialistId: 'casey', question: 'What about Ace?' }, /^\[morgan\] run=morgan_x askSpecialist start specialist=casey question="What about Ace\?"$/],
    [{ kind: 'askSpecialist.ok', runId: 'morgan_x', specialistId: 'casey', durationMs: 1842, chars: 921 }, /^\[morgan\] run=morgan_x askSpecialist ok specialist=casey durationMs=1842 chars=921$/],
    [{ kind: 'askSpecialist.error', runId: 'morgan_x', specialistId: 'casey', durationMs: 5, reason: 'boom' }, /^\[morgan\] run=morgan_x askSpecialist error specialist=casey durationMs=5 reason="boom"$/],
    [{ kind: 'capability_tool.started', runId: 'morgan_x', personaId: 'zoe', toolName: 'research' }, /^\[morgan\] run=morgan_x capabilityTool start persona=zoe tool=research$/],
    [{ kind: 'capability_tool.ok', runId: 'morgan_x', personaId: 'zoe', toolName: 'research', durationMs: 42 }, /^\[morgan\] run=morgan_x capabilityTool ok persona=zoe tool=research durationMs=42$/],
    [{ kind: 'capability_tool.error', runId: 'morgan_x', personaId: 'zoe', toolName: 'research', durationMs: 42, reason: 'timeout' }, /^\[morgan\] run=morgan_x capabilityTool error persona=zoe tool=research durationMs=42 reason="timeout"$/],
    [{ kind: 'guard.attribution', runId: 'morgan_x', status: 'passed', specialists: ['casey'] }, /^\[morgan\] run=morgan_x guard attribution passed consulted=casey$/],
    [{ kind: 'guard.attribution', runId: 'morgan_x', status: 'blocked', specialists: ['casey', 'sam'] }, /^\[morgan\] run=morgan_x guard attribution blocked unconsulted=casey,sam$/],
    [{ kind: 'final.accepted', runId: 'morgan_x' }, /^\[morgan\] run=morgan_x final accepted$/],
    [{ kind: 'final.failed', runId: 'morgan_x', reason: 'not_configured' }, /^\[morgan\] run=morgan_x final failed reason=not_configured$/],
  ]
  it.each(cases)('formats %o', (event, re) => {
    expect(formatTraceLine(event)).toMatch(re)
  })
  it('truncates a long question preview', () => {
    const line = formatTraceLine({ kind: 'askSpecialist.started', runId: 'r', specialistId: 'casey', question: 'q'.repeat(400) })
    expect(line.length).toBeLessThan(400)
  })
  it('escapes quotes and backslashes inside quoted previews', () => {
    expect(formatTraceLine({
      kind: 'askSpecialist.started',
      runId: 'r',
      specialistId: 'casey',
      question: 'What about "Ace" \\ Casey?',
    })).toContain('question="What about \\"Ace\\" \\\\ Casey?"')
    expect(formatTraceLine({
      kind: 'askSpecialist.error',
      runId: 'r',
      specialistId: 'casey',
      durationMs: 1,
      reason: 'failed "hard"',
    })).toContain('reason="failed \\"hard\\""')
  })
})

describe('consoleTraceSink', () => {
  it('writes a formatted line to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleTraceSink({ kind: 'final.accepted', runId: 'morgan_y' })
    expect(spy).toHaveBeenCalledWith('[morgan] run=morgan_y final accepted')
  })
})

describe('resolveTraceSink', () => {
  it('returns the injected sink verbatim when provided', () => {
    const sink = vi.fn()
    expect(resolveTraceSink(sink)).toBe(sink)
  })
  it('is silent under test by default (no console noise in the suite)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    resolveTraceSink(undefined)({ kind: 'final.accepted', runId: 'r' })
    expect(spy).not.toHaveBeenCalled()
  })
  it('logs to console when MORGAN_TRACE is forced on', () => {
    process.env.MORGAN_TRACE = 'on'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    resolveTraceSink(undefined)({ kind: 'final.accepted', runId: 'r' })
    expect(spy).toHaveBeenCalled()
  })
})

describe('deriveRunDebug', () => {
  it('summarizes a successful consult: pairs the started question with the ok status/duration', () => {
    const events: MorganTraceEvent[] = [
      { kind: 'run.started', runId: 'morgan_x', personaId: 'writingPartner' },
      { kind: 'askSpecialist.started', runId: 'morgan_x', specialistId: 'casey', question: 'What about Ace?' },
      { kind: 'askSpecialist.ok', runId: 'morgan_x', specialistId: 'casey', durationMs: 1842, chars: 921 },
      { kind: 'guard.attribution', runId: 'morgan_x', status: 'passed', specialists: ['casey'] },
      { kind: 'final.accepted', runId: 'morgan_x' },
    ]
    expect(deriveRunDebug('morgan_x', events)).toEqual({
      runId: 'morgan_x',
      consults: [{ specialistId: 'casey', question: 'What about Ace?', status: 'ok', durationMs: 1842 }],
      guardrails: [{ name: 'specialist_attribution', status: 'passed' }],
    })
  })

  it('summarizes a failed consult as status error with its duration', () => {
    const events: MorganTraceEvent[] = [
      { kind: 'askSpecialist.started', runId: 'r', specialistId: 'casey', question: 'Ace?' },
      { kind: 'askSpecialist.error', runId: 'r', specialistId: 'casey', durationMs: 5, reason: 'boom' },
    ]
    expect(deriveRunDebug('r', events).consults).toEqual([
      { specialistId: 'casey', question: 'Ace?', status: 'error', durationMs: 5 },
    ])
  })

  it('maps a blocked attribution guard into the guardrails list', () => {
    const events: MorganTraceEvent[] = [
      { kind: 'guard.attribution', runId: 'r', status: 'blocked', specialists: ['casey'] },
    ]
    expect(deriveRunDebug('r', events).guardrails).toEqual([
      { name: 'specialist_attribution', status: 'blocked' },
    ])
  })

  it('does not reuse a consumed question for a later terminal event lacking a fresh start', () => {
    const events: MorganTraceEvent[] = [
      { kind: 'askSpecialist.started', runId: 'r', specialistId: 'casey', question: 'Q1' },
      { kind: 'askSpecialist.ok', runId: 'r', specialistId: 'casey', durationMs: 1, chars: 1 },
      { kind: 'askSpecialist.error', runId: 'r', specialistId: 'casey', durationMs: 2, reason: 'x' },
    ]
    const consults = deriveRunDebug('r', events).consults
    expect(consults[0].question).toBe('Q1')
    expect(consults[1].question).toBe('')
  })

  it('returns empty consults and guardrails for a direct answer (no consult/guard events)', () => {
    const events: MorganTraceEvent[] = [
      { kind: 'run.started', runId: 'r', personaId: 'writingPartner' },
      { kind: 'final.accepted', runId: 'r' },
    ]
    expect(deriveRunDebug('r', events)).toEqual({ runId: 'r', consults: [], guardrails: [] })
  })

  it('truncates a long consult question so debug never carries raw bulk prose', () => {
    const events: MorganTraceEvent[] = [
      { kind: 'askSpecialist.started', runId: 'r', specialistId: 'casey', question: 'q'.repeat(400) },
      { kind: 'askSpecialist.ok', runId: 'r', specialistId: 'casey', durationMs: 1, chars: 1 },
    ]
    expect(deriveRunDebug('r', events).consults[0].question.length).toBeLessThan(400)
  })
})

describe('isDebugApiEnabled', () => {
  it('is off by default', () => {
    expect(isDebugApiEnabled()).toBe(false)
  })
  it('is on only when MORGAN_DEBUG_API is exactly "on"', () => {
    process.env.MORGAN_DEBUG_API = 'on'
    expect(isDebugApiEnabled()).toBe(true)
    process.env.MORGAN_DEBUG_API = '1'
    expect(isDebugApiEnabled()).toBe(false)
  })
})
