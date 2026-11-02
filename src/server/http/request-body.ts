import { AppError } from "@/shared/lib/errors";

const MAX_JSON_BYTES = 16 * 1024;

/** Bound the actual stream, including requests without Content-Length. */
export async function readJsonBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new AppError("Send an application/json request.", 415);
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)
  )
    throw new AppError("Request body is too large.", 413);
  if (!request.body) throw new AppError("A JSON body is required.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new AppError("Request body is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof TypeError)
      throw new AppError("Use valid UTF-8 JSON.", 400);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
