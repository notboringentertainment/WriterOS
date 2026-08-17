import { describe, expect, it } from 'vitest'
import { redactApiLogResponse } from '../../server/apiLogRedaction'

describe('API response log redaction', () => {
  it('removes project-library tokens and project content from logs', () => {
    expect(redactApiLogResponse('/api/project-library/bootstrap', {
      enabled: true,
      label: 'WriterOS Projects',
      sessionToken: 'secret-token',
    })).toEqual({ enabled: true, label: 'WriterOS Projects', sessionToken: '[redacted]' })

    expect(redactApiLogResponse('/api/project-library/projects/project-1', {
      result: { project: { state: { synopsis: 'private story' } } },
    })).toEqual({ projectLibrary: '[redacted]' })
  })
})
