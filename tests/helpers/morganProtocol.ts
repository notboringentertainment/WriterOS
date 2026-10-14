import type { Hello, Ping, Stamped, LiveEvent } from '../../shared/morganLive'

export const rowTemplate = (): Extract<LiveEvent, { kind: 'row' }> => ({
  kind: 'row', uuid: 'row', door: 'transcript', type: 'assistant', role: 'assistant',
  origin: { kind: 'model', model: 'test-model' }, blocks: [],
})
export const row = (seq: number, text: string, overrides: Partial<Extract<Stamped, { kind: 'row' }>> = {}): Stamped =>
  ({ ...rowTemplate(), seq, at: 0, uuid: String(seq), blocks: [{ type: 'text', text }], ...overrides })
export const waiting = (seq: number, requestId: string, reason: Extract<LiveEvent, { kind: 'waiting-for-input' }>['reason'], detail: string): Stamped =>
  ({ kind: 'waiting-for-input', seq, at: 0, requestId, reason, detail })
export const hello = (overrides: Partial<Hello> = {}): Hello =>
  ({ epoch: 'e1', sessionId: 's1', source: 'launch', cwd: '/', claudeVersion: '2.1.292', ...overrides })
export const ping = (epoch: string, enqueuedThrough: number): Ping => ({ epoch, enqueuedThrough })
