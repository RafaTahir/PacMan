import { handleRequest } from "./app";
import type { Env } from "./d1";

// Keep only the default Worker entrypoint here. Non-handler named exports are
// invalid workerd exports; reusable API code and constants live in app.ts.
export default { fetch(request: Request, env: Env): Promise<Response> { return handleRequest(request, env); } };
