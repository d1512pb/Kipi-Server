import type { Context } from "hono";
import { ApiErrorCode } from "@kipi/domain";
import { writeProblem } from "../http/problem-json.js";
import { getSupabaseAdmin } from "../supabase/client.js";

function demoBypassAuthEnabled(): boolean {
  const raw = process.env["DEMO_BYPASS_AUTH"];
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
  return m?.[1] ? m[1].trim() : null;
}

export async function requireSupabaseUser(c: Context): Promise<
  | { ok: true; user: { id: string; email?: string | null }; token: string }
  | { ok: false; response: Response }
> {
  if (demoBypassAuthEnabled()) {
    // Demo mode: accept requests without validating Supabase JWT.
    return {
      ok: true,
      token: "demo",
      user: { id: "00000000-0000-0000-0000-000000000000", email: "demo@kipi.local" },
    };
  }

  const authHeader = c.req.header("Authorization");
  const token = parseBearerToken(authHeader);
  if (!token) {
    // Safe log: never include token contents.
    const scheme = typeof authHeader === "string" ? authHeader.trim().split(/\s+/)[0] : "missing";
    console.warn("[kipi/api][auth] Missing/invalid Authorization header", {
      path: new URL(c.req.url).pathname,
      scheme,
      origin: c.req.header("Origin") ?? null,
      user_agent: c.req.header("User-Agent") ?? null,
    });
    return {
      ok: false,
      response: writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "Falta Authorization: Bearer <token>."),
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    console.warn("[kipi/api][auth] Supabase token rejected", {
      path: new URL(c.req.url).pathname,
      origin: c.req.header("Origin") ?? null,
      user_agent: c.req.header("User-Agent") ?? null,
      supabase_error: error?.message ?? null,
    });
    return {
      ok: false,
      response: writeProblem(
        c,
        ApiErrorCode.AUTH_REQUIRED,
        error?.message ? `Token inválido o expirado. (${error.message})` : "Token inválido o expirado.",
      ),
    };
  }

  return {
    ok: true,
    token,
    user: { id: data.user.id, email: data.user.email ?? null },
  };
}

