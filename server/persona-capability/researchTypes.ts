export interface ResearchFinding {
  claim: string
  sourceLabel?: string
  url?: string
  verified: boolean
}

export interface ResearchSource {
  label: string
  url?: string
}

export interface ResearchTaskResult {
  findings: ResearchFinding[]
  sources: ResearchSource[]
  missing: string[]
  unverified: string[]
}

export const EMPTY_RESEARCH_TASK_RESULT: ResearchTaskResult = {
  findings: [],
  sources: [],
  missing: [],
  unverified: [],
}
