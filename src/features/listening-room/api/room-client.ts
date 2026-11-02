import { roomViewSchema } from "../model/contracts";
import { requestJson } from "@/shared/api/http-client";
export const roomRequest = (
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
) =>
  requestJson(path, roomViewSchema, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
