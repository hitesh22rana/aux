import { z } from "zod";

const errorSchema = z.object({ error: z.string() });

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Validate untrusted JSON at the boundary before it reaches client state. */
export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an unreadable response."
        : "Couldn’t connect. Please try again.",
    );
  }
  if (!response.ok) {
    const failure = errorSchema.safeParse(data);
    throw new Error(
      failure.success
        ? failure.data.error
        : "Couldn’t complete the request. Please try again.",
    );
  }
  const result = schema.safeParse(data);
  if (!result.success)
    throw new Error(
      "The server returned unexpected data. Please refresh and try again.",
    );
  return result.data;
}
