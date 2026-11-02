import * as v from "valibot";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const errorSchema = v.object({ error: v.string() });

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Validate untrusted JSON at the boundary before it reaches client state. */
export async function requestJson<T>(
  path: string,
  schema: v.GenericSchema<unknown, T>,
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
    const failure = v.safeParse(errorSchema, data);
    throw new HttpError(
      failure.success
        ? failure.output.error
        : "Couldn’t complete the request. Please try again.",
      response.status,
    );
  }
  const result = v.safeParse(schema, data);
  if (!result.success)
    throw new Error(
      "The server returned unexpected data. Please refresh and try again.",
    );
  return result.output;
}
