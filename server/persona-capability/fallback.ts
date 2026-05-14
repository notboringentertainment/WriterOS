import type {
  PersonaCapabilityFailureReason,
  PersonaCapabilityStatus,
} from '@shared/personaCapability'

export function buildPersonaCapabilityFallbackMessage(
  status: PersonaCapabilityStatus,
  failureReason?: PersonaCapabilityFailureReason
): string {
  if (status === 'timeout' || failureReason === 'timeout') {
    return "I couldn't finish the research pass before it timed out, Writer, so I don't want to pretend I verified outside facts. For now, treat the scene as a world-building question: anchor the arrival in one concrete threshold, one sensory contrast, and one rule of the place that your guide knows better than the reader."
  }

  if (status === 'soft_fail') {
    return "I couldn't complete the research pass cleanly, Writer, so I won't make source-backed claims here. The useful next move is to separate what the scene needs emotionally from what needs verification: choose the gate's dramatic function first, then we can attach verified history once the research lane is available again."
  }

  return "I couldn't shape the research pass into a clean Zoe answer, Writer. Keep the scene grounded in visible rules: who gets to move through this place, what changes at the threshold, and what detail your character would notice that a tourist would miss."
}
