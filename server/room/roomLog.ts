// Writers' Room — error logging with a timestamp.
//
// launchd redirects stderr straight to ~/Library/Logs/writeros.error.log with no
// timestamps, so a scheduler failure that fires every 5 seconds is impossible to
// date after the fact. Every room error line starts with an ISO-8601 UTC time.

export function roomError(message: string, error: unknown): void {
  console.error(`${new Date().toISOString()} ${message}`, error);
}

export function roomWarn(message: string, error: unknown): void {
  console.warn(`${new Date().toISOString()} ${message}`, error);
}
