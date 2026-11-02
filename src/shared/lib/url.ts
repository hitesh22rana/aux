/** Parse external URL input without exposing constructor errors to callers. */
export function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}
