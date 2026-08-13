export function redactApiLogResponse(
  requestPath: string,
  bodyJson: Record<string, unknown>,
): Record<string, unknown> {
  if (requestPath === '/api/voice-profile/synthesize' && 'profile' in bodyJson) {
    return { ...bodyJson, profile: '[redacted]' }
  }

  if (requestPath === '/api/project-library/bootstrap') {
    return 'sessionToken' in bodyJson
      ? { ...bodyJson, sessionToken: '[redacted]' }
      : bodyJson
  }

  if (requestPath.startsWith('/api/project-library/')) {
    return { projectLibrary: '[redacted]' }
  }

  return bodyJson
}
