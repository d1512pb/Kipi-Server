import { Hono } from "hono";
import { ApiErrorCode, decideEscalationToParent, assertRiskLevel } from "@kipi/domain";
import { writeProblem } from "../http/problem-json.js";
import { isUuid } from "../validation/uuid.js";
import { requireSupabaseUser } from "../auth/requireSupabaseUser.js";
import { getSupabaseAdmin } from "../supabase/client.js";
import { generatePairingOtp, normalizePairingOtp, isValidPairingOtpFormat } from "../pairing/otp.js";
import { PARENT_DASHBOARD_ASSISTANT_SYSTEM_PROMPT } from "../assistant/masterPrompt.js";
import { geminiGenerateText } from "../model-providers/gemini.js";
import { classifyNotification, decideCloudEscalation } from "../notifications/classifier.js";
import crypto from "crypto";

type OwnedMinorAuth = { parentId: string; minorId: string };

type DeviceAuth = { deviceId: string; minorId: string };

function demoBypassAuthEnabled(): boolean {
  const raw = process.env["DEMO_BYPASS_AUTH"];
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}

function newDeviceApiKey(): string {
  // 256-bit random key, encoded URL-safe. Client stores plaintext; DB stores only hash.
  return crypto.randomBytes(32).toString("base64url");
}

function readDeviceAuthHeader(c: any): string | null {
  const raw = c.req.header("Authorization") || "";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Prefer explicit "Device <token>" to avoid confusion with Supabase JWT.
  const m = /^Device\s+(.+)$/i.exec(trimmed);
  if (m?.[1]) return m[1].trim();
  return null;
}

async function requireDevice(c: any): Promise<
  | { ok: true; data: DeviceAuth }
  | { ok: false; response: Response }
> {
  if (demoBypassAuthEnabled()) {
    // Demo mode: allow device ingestion without validating api_key.
    // Use IDs provided by client when available, else fall back to fixed placeholders.
    const q = new URL(c.req.url).searchParams;
    const deviceId = q.get("device_id") || "00000000-0000-0000-0000-000000000000";
    const minorId = q.get("minor_id") || "00000000-0000-0000-0000-000000000000";
    return { ok: true, data: { deviceId, minorId } };
  }

  const apiKey = readDeviceAuthHeader(c);
  if (!apiKey || apiKey.length < 16) {
    return {
      ok: false,
      response: writeProblem(
        c,
        ApiErrorCode.AUTH_REQUIRED,
        "Falta Authorization: Device <api_key> (token del dispositivo).",
      ),
    };
  }

  const supabase = getSupabaseAdmin();
  const apiKeyHash = sha256Base64Url(apiKey);
  const { data: device, error } = await supabase
    .from("devices")
    .select("id,minor_id")
    .eq("api_key_hash", apiKeyHash)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al validar dispositivo."),
    };
  }
  if (!device) {
    return {
      ok: false,
      response: writeProblem(c, ApiErrorCode.FORBIDDEN, "Token de dispositivo inválido o revocado."),
    };
  }

  return { ok: true, data: { deviceId: String(device.id), minorId: String(device.minor_id) } };
}

async function requireOwnedMinor(c: any, minorId: string): Promise<
  | { ok: true; data: OwnedMinorAuth }
  | { ok: false; response: Response }
> {
  if (!minorId || !isUuid(minorId)) {
    return {
      ok: false,
      response: writeProblem(c, ApiErrorCode.INVALID_UUID, "minor_id es obligatorio y debe ser un UUID válido."),
    };
  }

  if (demoBypassAuthEnabled()) {
    // Demo mode: skip Supabase auth + ownership checks.
    return { ok: true, data: { parentId: "demo", minorId } };
  }

  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth;

  const supabase = getSupabaseAdmin();
  const { data: minor, error } = await supabase
    .from("minors")
    .select("id,parent_id")
    .eq("id", minorId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al buscar menor."),
    };
  }
  if (!minor) {
    return { ok: false, response: writeProblem(c, ApiErrorCode.MINOR_NOT_FOUND, "Menor no encontrado.") };
  }
  if (String(minor.parent_id) !== auth.user.id) {
    return { ok: false, response: writeProblem(c, ApiErrorCode.FORBIDDEN, "No tienes permisos sobre este menor.") };
  }

  return { ok: true, data: { parentId: auth.user.id, minorId } };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortSpanishDayLabel(d: Date): string {
  return d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
}

function screenTimeKeyFromCategory(category: string): string {
  const c = category.trim().toLowerCase();
  if (c.includes("juego")) return "games";
  if (c.includes("rede") || c.includes("social")) return "social";
  if (c.includes("video")) return "videos";
  if (c.includes("educ")) return "education";
  if (c.includes("comun")) return "communication";
  return "other";
}

/**
 * HTTP adapter skeleton. Replace handlers with real adapters (Supabase, model provider)
 * wired to `@kipi/domain` ports while keeping request/response contracts stable.
 */
export const apiRouter = new Hono();

function looksLikeMissingRelation(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("relation") || m.includes("schema cache");
}

async function ensureDemoActivityForMinor(supabase: any, minorId: string) {
  // Solo crea datos si NO hay nada todavía (evita ensuciar cuentas reales).
  const { data: existing, error: existingErr } = await supabase
    .from("screen_time_logs")
    .select("id")
    .eq("minor_id", minorId)
    .limit(1);
  if (existingErr) return;
  if (Array.isArray(existing) && existing.length > 0) return;

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    return iso(d);
  });

  await supabase.from("screen_time_logs").insert(
    days.flatMap((day: string) => [
      { minor_id: minorId, app_name: "TikTok", category: "Redes Sociales", minutes: day === days[0] ? 90 : 60, log_date: day },
      { minor_id: minorId, app_name: "Roblox", category: "Juegos", minutes: day === days[0] ? 70 : 45, log_date: day },
      { minor_id: minorId, app_name: "YouTube", category: "Videos", minutes: day === days[0] ? 55 : 35, log_date: day },
      { minor_id: minorId, app_name: "Duolingo", category: "Educación", minutes: day === days[0] ? 20 : 10, log_date: day },
    ]),
  );

  const { data: ev, error: evErr } = await supabase.from("app_events").select("id").eq("minor_id", minorId).limit(1);
  if (!evErr && (!Array.isArray(ev) || ev.length === 0)) {
    await supabase.from("app_events").insert([
      { minor_id: minorId, app_name: "TikTok", event_type: "installed", category: "Redes Sociales", risk_level: "medium" },
      { minor_id: minorId, app_name: "Roblox", event_type: "updated", category: "Juegos", risk_level: "low" },
      { minor_id: minorId, app_name: "WhatsApp", event_type: "installed", category: "Comunicación", risk_level: "medium" },
    ]);
  }

  const { data: dev, error: devErr } = await supabase.from("devices").select("id").eq("minor_id", minorId).limit(1);
  if (!devErr && (!Array.isArray(dev) || dev.length === 0)) {
    await supabase.from("devices").insert({
      minor_id: minorId,
      device_name: "Dispositivo vinculado",
      device_model: "Demo Device",
      os: "Android",
      status: "online",
      battery: 82,
      last_sync: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      device_type: "phone",
      protection_active: true,
    });
  }
}

apiRouter.get("/dashboard", async (c) => {
  const parentId = c.req.query("parent_id");
  if (!parentId || !isUuid(parentId)) {
    return writeProblem(
      c,
      ApiErrorCode.INVALID_UUID,
      "parent_id es obligatorio y debe ser un UUID válido.",
    );
  }

  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "parent_id no coincide con el usuario autenticado.");
  }

  const supabase = getSupabaseAdmin();

  // Ensure parent row exists (prevents downstream FK issues when writing).
  await supabase
    .from("parents")
    .upsert({ id: parentId, email: auth.user.email ?? null }, { onConflict: "id" });

  const { data: minors, error: minorsError } = await supabase
    .from("minors")
    .select("id,parent_id,name,age_mode,shared_alert_levels,created_at")
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });

  if (minorsError) {
    return writeProblem(
      c,
      ApiErrorCode.INTERNAL_ERROR,
      minorsError.message || "Error al cargar menores.",
    );
  }

  if (process.env["NODE_ENV"] !== "production") {
    const n = Array.isArray(minors) ? minors.length : 0;
    console.log(`[kipi/api] GET /dashboard parent=${parentId} minors=${n}`);
  }

  const ASISTENTE_PARENTAL_MOCK = {
    guia_contextual:
      "Tu hijo podría estar compartiendo datos personales. Te sugerimos abrir la conversación diciendo...",
    recursos: ["SAPTEL", "Policía Cibernética"],
  } as const;

  const minorsList = minors ?? [];
  const alertsByMinor = new Map<string, any[]>();

  // Obtener alertas por menor y exponer `fecha` + `asistente_parental` mock.
  // (Más compatible con la UI y evita sorpresas con .in() en algunos entornos.)
  try {
    await Promise.all(
      minorsList.map(async (m) => {
        const { data: alerts, error } = await supabase
          .from("alerts")
          .select("id,app_source,risk_level,sensitive_data_flag,created_at,escalated_to_parent")
          .eq("minor_id", m.id)
          .eq("escalated_to_parent", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        const list = (alerts ?? []).map((a) => {
          const row: Record<string, unknown> = {
            id: a.id,
            app_source: a.app_source,
            risk_level: a.risk_level,
            sensitive_data_flag: a.sensitive_data_flag,
            created_at: a.created_at,
            fecha: a.created_at ? new Date(String(a.created_at)).toISOString() : null,
          };
          if (a.risk_level === 2 || a.risk_level === 3) {
            row["asistente_parental"] = { ...ASISTENTE_PARENTAL_MOCK };
          }
          return row;
        });

        alertsByMinor.set(String(m.id), list);
      }),
    );
  } catch (err: any) {
    return writeProblem(
      c,
      ApiErrorCode.INTERNAL_ERROR,
      err?.message ? String(err.message) : "Error al cargar alertas.",
    );
  }

  const result = minorsList.map((m) => {
    const rows = alertsByMinor.get(String(m.id)) ?? [];
    const lvl2 = rows.filter((r) => r.risk_level === 2).length;
    const lvl3 = rows.filter((r) => r.risk_level === 3).length;
    return {
      minor_id: m.id,
      name: m.name,
      age_mode: m.age_mode,
      shared_alert_levels: m.shared_alert_levels ?? [1, 2, 3],
      stats: { alertas_nivel_2: lvl2, alertas_nivel_3: lvl3 },
      alertas_recientes: rows,
    };
  });

  return c.json({ ok: true as const, minors: result });
});

apiRouter.get("/screen-time", async (c) => {
  const minorId = c.req.query("minor_id");
  if (!minorId || !isUuid(minorId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "minor_id es obligatorio y debe ser un UUID válido.");
  }

  const auth = await requireOwnedMinor(c, minorId);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  const today = new Date();
  const todayIso = isoDate(today);
  const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const startIso = isoDate(start);

  const { data: rows, error } = await supabase
    .from("screen_time_logs")
    .select("category,minutes,log_date")
    .eq("minor_id", minorId)
    .gte("log_date", startIso)
    .lte("log_date", todayIso);

  if (error) {
    console.error("[kipi/api] /screen-time supabase error:", error);
    if (looksLikeMissingRelation(error.message)) {
      return c.json({ ok: true as const, today: { total_minutes: 0, by_category: [] }, weekly: [] });
    }
    return writeProblem(
      c,
      ApiErrorCode.INTERNAL_ERROR,
      error.message || "Error al cargar tiempo de pantalla.",
    );
  }

  let list = rows ?? [];
  if (list.length === 0) {
    await ensureDemoActivityForMinor(supabase, minorId);
    const { data: retry } = await supabase
      .from("screen_time_logs")
      .select("category,minutes,log_date")
      .eq("minor_id", minorId)
      .gte("log_date", startIso)
      .lte("log_date", todayIso);
    list = retry ?? [];
  }
  const totalMinutesToday = list
    .filter((r) => String((r as any).log_date) === todayIso)
    .reduce((acc, r: any) => acc + (typeof r.minutes === "number" ? r.minutes : 0), 0);

  const minutesByCategory = new Map<string, number>();
  for (const r of list as any[]) {
    const logDate = String(r.log_date);
    if (logDate !== todayIso) continue;
    const category = typeof r.category === "string" ? r.category : "Otros";
    const minutes = typeof r.minutes === "number" ? r.minutes : 0;
    minutesByCategory.set(category, (minutesByCategory.get(category) ?? 0) + minutes);
  }

  const byCategory = Array.from(minutesByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, minutes]) => ({
      name,
      hours: Math.round((minutes / 60) * 10) / 10,
      key: screenTimeKeyFromCategory(name),
    }));

  const minutesByDay = new Map<string, number>();
  for (const r of list as any[]) {
    const logDate = String(r.log_date);
    const minutes = typeof r.minutes === "number" ? r.minutes : 0;
    minutesByDay.set(logDate, (minutesByDay.get(logDate) ?? 0) + minutes);
  }

  const weekly: Array<{ day: string; hours: number }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = isoDate(d);
    const total = minutesByDay.get(key) ?? 0;
    weekly.push({ day: shortSpanishDayLabel(d), hours: Math.round((total / 60) * 10) / 10 });
  }

  return c.json({
    ok: true as const,
    today: { total_minutes: totalMinutesToday, by_category: byCategory },
    weekly,
  });
});

apiRouter.get("/apps/recent", async (c) => {
  const minorId = c.req.query("minor_id");
  if (!minorId || !isUuid(minorId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "minor_id es obligatorio y debe ser un UUID válido.");
  }

  const auth = await requireOwnedMinor(c, minorId);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_events")
    .select("id,app_name,event_type,category,risk_level,created_at")
    .eq("minor_id", minorId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[kipi/api] /apps/recent supabase error:", error);
    if (looksLikeMissingRelation(error.message)) {
      return c.json({ ok: true as const, apps: [] });
    }
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al cargar apps recientes.");
  }

  let list = data ?? [];
  if (list.length === 0) {
    await ensureDemoActivityForMinor(supabase, minorId);
    const { data: retry } = await supabase
      .from("app_events")
      .select("id,app_name,event_type,category,risk_level,created_at")
      .eq("minor_id", minorId)
      .order("created_at", { ascending: false })
      .limit(10);
    list = retry ?? [];
  }

  const apps = list.map((r: any) => ({
    id: r.id,
    name: r.app_name,
    event_type: r.event_type,
    category: r.category,
    risk_level: r.risk_level,
    created_at: r.created_at,
  }));

  return c.json({ ok: true as const, apps });
});

apiRouter.get("/devices", async (c) => {
  const minorId = c.req.query("minor_id");
  if (!minorId || !isUuid(minorId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "minor_id es obligatorio y debe ser un UUID válido.");
  }

  const auth = await requireOwnedMinor(c, minorId);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("devices")
    .select("id,device_name,device_model,os,status,battery,last_sync,device_type,protection_active,created_at")
    .eq("minor_id", minorId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[kipi/api] /devices supabase error:", error);
    if (looksLikeMissingRelation(error.message)) {
      return c.json({ ok: true as const, devices: [] });
    }
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al cargar dispositivos.");
  }

  let list = data ?? [];
  if (list.length === 0) {
    await ensureDemoActivityForMinor(supabase, minorId);
    const { data: retry } = await supabase
      .from("devices")
      .select("id,device_name,device_model,os,status,battery,last_sync,device_type,protection_active,created_at")
      .eq("minor_id", minorId)
      .order("created_at", { ascending: true });
    list = retry ?? [];
  }

  const devices = list.map((d: any) => ({
    id: d.id,
    device_name: d.device_name,
    device_model: d.device_model,
    os: d.os,
    status: d.status,
    battery: d.battery,
    last_sync: d.last_sync,
    device_type: d.device_type,
    protection_active: d.protection_active,
  }));

  return c.json({ ok: true as const, devices });
});

apiRouter.get("/ai/stats", async (c) => {
  const parentId = c.req.query("parent_id");
  if (!parentId || !isUuid(parentId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "parent_id es obligatorio y debe ser un UUID válido.");
  }

  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "parent_id no coincide con el usuario autenticado.");
  }

  const supabase = getSupabaseAdmin();
  const { data: minors, error: minorsError } = await supabase
    .from("minors")
    .select("id")
    .eq("parent_id", parentId);

  if (minorsError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorsError.message || "Error al cargar menores.");
  }

  const minorIds = (minors ?? []).map((m: any) => m.id);
  if (minorIds.length === 0) {
    return c.json({
      ok: true as const,
      stats: {
        messages_analyzed: 0,
        threats_detected: 0,
        privacy_breaches: 0,
        last_audit: null,
        data_retention_days: 0,
        processing_local: true,
      },
    });
  }

  const { data: alerts, error: alertsError } = await supabase
    .from("alerts")
    .select("risk_level,sensitive_data_flag,created_at,minor_id")
    .in("minor_id", minorIds);

  if (alertsError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, alertsError.message || "Error al cargar alertas.");
  }

  const list = alerts ?? [];
  const messagesAnalyzed = list.length;
  const threatsDetected = list.filter((a: any) => typeof a.risk_level === "number" && a.risk_level >= 2).length;
  const privacyBreaches = list.filter((a: any) => Boolean(a.sensitive_data_flag)).length;
  const lastAudit = list
    .map((a: any) => (a.created_at ? new Date(String(a.created_at)).getTime() : 0))
    .reduce((max, t) => (t > max ? t : max), 0);

  return c.json({
    ok: true as const,
    stats: {
      messages_analyzed: messagesAnalyzed,
      threats_detected: threatsDetected,
      privacy_breaches: privacyBreaches,
      last_audit: lastAudit ? new Date(lastAudit).toISOString() : null,
      data_retention_days: 0,
      processing_local: true,
    },
  });
});

apiRouter.post("/alerts/manual", async (c) => {
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const minorId = record["minor_id"];
  if (typeof minorId !== "string" || !isUuid(minorId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "minor_id es obligatorio y debe ser un UUID válido.");
  }

  const supabase = getSupabaseAdmin();
  const { data: minor, error: minorError } = await supabase
    .from("minors")
    .select("id,parent_id")
    .eq("id", minorId)
    .maybeSingle();
  if (minorError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorError.message || "Error al buscar menor.");
  }
  if (!minor) {
    return writeProblem(c, ApiErrorCode.MINOR_NOT_FOUND, "Menor no encontrado.");
  }
  if (!demoBypassAuthEnabled() && String(minor.parent_id) !== auth.user.id) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "No tienes permisos sobre este menor.");
  }

  const isManualHelp = typeof record["is_manual_help"] === "boolean" ? record["is_manual_help"] : false;

  const description =
    typeof record["description"] === "string" && record["description"].trim()
      ? record["description"].trim().slice(0, 800)
      : null;

  const { data: inserted, error: insertError } = await supabase
    .from("alerts")
    .insert({
      minor_id: minorId,
      app_source: typeof record["app_source"] === "string" ? record["app_source"] : "Manual",
      description,
      risk_level:
        typeof record["risk_level"] === "number" && [1, 2, 3].includes(record["risk_level"])
          ? record["risk_level"]
          : 2,
      confidence_score: 1,
      sensitive_data_flag: false,
      escalated_to_parent: true,
      is_manual_help: isManualHelp,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, insertError?.message || "Error al crear alerta manual.");
  }

  return c.json({ ok: true as const, alert_id: inserted.id, message: "Alerta manual creada." });
});

apiRouter.patch("/minors/agreement", async (c) => {
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const minorId = record["minor_id"];
  if (typeof minorId !== "string" || !isUuid(minorId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "minor_id es obligatorio y debe ser un UUID válido.");
  }
  const levelsRaw = record["shared_alert_levels"];
  const levels = Array.isArray(levelsRaw)
    ? (levelsRaw as unknown[])
        .filter((n): n is number => typeof n === "number" && Number.isInteger(n))
        .filter((n) => n >= 1 && n <= 3)
    : [];

  const supabase = getSupabaseAdmin();
  const { data: minor, error: minorError } = await supabase
    .from("minors")
    .select("id,parent_id")
    .eq("id", minorId)
    .maybeSingle();
  if (minorError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorError.message || "Error al buscar menor.");
  }
  if (!minor) {
    return writeProblem(c, ApiErrorCode.MINOR_NOT_FOUND, "Menor no encontrado.");
  }
  if (!demoBypassAuthEnabled() && String(minor.parent_id) !== auth.user.id) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "No tienes permisos sobre este menor.");
  }

  const { error: updateError } = await supabase
    .from("minors")
    .update({ shared_alert_levels: levels.length ? levels : [1, 2, 3] })
    .eq("id", minorId);

  if (updateError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, updateError.message || "Error al actualizar acuerdos.");
  }

  return c.json({ ok: true as const, message: "Acuerdos actualizados." });
});

apiRouter.post("/pairing/generate-code", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;

  const deviceModel = typeof record["device_model"] === "string" ? record["device_model"] : null;
  const fcmPushToken = typeof record["fcm_push_token"] === "string" ? record["fcm_push_token"] : null;

  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const otp = generatePairingOtp(6);
    const { data, error } = await supabase
      .from("pairing_sessions")
      .insert({
        otp,
        status: "pending",
        expires_at: expiresAt,
        device_model: deviceModel,
        fcm_push_token: fcmPushToken,
      })
      .select("id,otp,expires_at")
      .single();

    if (!error && data) {
      return c.json({
        ok: true as const,
        session_id: data.id,
        otp: data.otp,
        expires_at: data.expires_at,
      });
    }

    lastError = error?.message ?? "Error al generar el código.";
  }

  return writeProblem(
    c,
    ApiErrorCode.INTERNAL_ERROR,
    lastError || "No se pudo generar un código de emparejamiento.",
  );
});

apiRouter.post("/pairing/confirm-code", async (c) => {
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const parentId = record["parent_id"];
  const otpRaw = record["otp"];

  if (typeof parentId !== "string" || !isUuid(parentId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "parent_id es obligatorio y debe ser un UUID válido.");
  }
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "parent_id no coincide con el usuario autenticado.");
  }

  const otp = normalizePairingOtp(otpRaw);
  if (!isValidPairingOtpFormat(otp, 6)) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "Código inválido. Debe ser de 6 caracteres (A-Z / 2-9).");
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("pairing_sessions")
    .select("id,otp,status,expires_at,device_model,fcm_push_token,device_id,minor_id_created,claimed_at")
    .eq("otp", otp)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (sessionError) {
    return writeProblem(
      c,
      ApiErrorCode.INTERNAL_ERROR,
      sessionError.message || "Error al validar el código.",
    );
  }

  if (!session) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "Código inválido o expirado.");
  }

  await supabase
    .from("parents")
    .upsert({ id: parentId, email: auth.user.email ?? null }, { onConflict: "id" });

  // Crea el Minor si aún no existe para esta sesión.
  const existingMinorId = (session as any).minor_id_created ? String((session as any).minor_id_created) : null;
  let minorId = existingMinorId;
  if (!minorId) {
    const { data: minor, error: minorError } = await supabase
      .from("minors")
      .insert({
        parent_id: parentId,
        name: "Dispositivo vinculado",
        age_mode: "teen",
        shared_alert_levels: [1, 2, 3],
        device_token: (session as any).fcm_push_token ?? null,
      })
      .select("id")
      .single();

    if (minorError || !minor) {
      return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorError?.message || "Error al crear menor.");
    }
    minorId = String(minor.id);
  }

  // Si el dispositivo ya había generado un FCM token, persístelo en el menor.
  // (En el esquema actual, `minors.device_token` es el destino final; `pairing_sessions.fcm_push_token` es temporal.)
  const fcmToken = typeof (session as any).fcm_push_token === "string" ? String((session as any).fcm_push_token) : null;
  if (fcmToken) {
    // No sobrescribimos si ya existe uno; esto permite renovar el token con un endpoint dedicado más adelante.
    await supabase.from("minors").update({ device_token: fcmToken }).eq("id", minorId).is("device_token", null);
  }

  // Crea el Device si aún no existe para esta sesión.
  const existingDeviceId = (session as any).device_id ? String((session as any).device_id) : null;
  let deviceId = existingDeviceId;
  if (!deviceId) {
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .insert({
        minor_id: minorId,
        device_name: "Dispositivo vinculado",
        device_model: (session as any).device_model ?? null,
        os: "Android",
        status: "online",
        battery: 100,
        last_sync: new Date().toISOString(),
        device_type: "phone",
        protection_active: true,
        api_key_hash: null,
        last_seen: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (deviceError || !device) {
      return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, deviceError?.message || "Error al crear device.");
    }
    deviceId = String(device.id);
  }

  const { error: updateError } = await supabase
    .from("pairing_sessions")
    .update({ status: "paired", minor_id_created: minorId, device_id: deviceId })
    .eq("id", session.id);

  if (updateError) {
    return writeProblem(
      c,
      ApiErrorCode.INTERNAL_ERROR,
      updateError.message || "Error al actualizar sesión de emparejamiento.",
    );
  }

  return c.json({
    ok: true as const,
    minor_id: minorId,
    device_id: deviceId,
    message: "Dispositivo vinculado correctamente.",
  });
});

/**
 * Pairing claim (Android): intercambia session_id + otp por un token de dispositivo.
 * Esto permite que el dispositivo ingeste métricas/alertas sin usar JWT de Supabase.
 */
apiRouter.post("/pairing/claim", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const sessionId = record["session_id"];
  const otpRaw = record["otp"];
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "session_id es obligatorio y debe ser un UUID válido.");
  }
  const otp = normalizePairingOtp(otpRaw);
  if (!isValidPairingOtpFormat(otp, 6)) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "otp inválido (6 caracteres A-Z/2-9).");
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: session, error } = await supabase
    .from("pairing_sessions")
    .select("id,otp,status,expires_at,minor_id_created,device_id,claimed_at")
    .eq("id", sessionId)
    .eq("otp", otp)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al reclamar pairing.");
  }
  if (!session) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "Sesión inválida o expirada.");
  }
  if (String((session as any).status) !== "paired") {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "Aún no está confirmado por el padre.");
  }
  const minorId = (session as any).minor_id_created ? String((session as any).minor_id_created) : null;
  const deviceId = (session as any).device_id ? String((session as any).device_id) : null;
  if (!minorId || !deviceId) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, "Sesión sin minor_id_created/device_id.");
  }
  if ((session as any).claimed_at) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "Esta sesión ya fue reclamada.");
  }

  const apiKey = newDeviceApiKey();
  const apiKeyHash = sha256Base64Url(apiKey);

  const [{ error: devErr }, { error: sessErr }] = await Promise.all([
    supabase.from("devices").update({ api_key_hash: apiKeyHash, last_seen: new Date().toISOString() }).eq("id", deviceId),
    supabase.from("pairing_sessions").update({ claimed_at: new Date().toISOString() }).eq("id", sessionId),
  ]);

  if (devErr || sessErr) {
    return writeProblem(
      c,
      ApiErrorCode.INTERNAL_ERROR,
      devErr?.message || sessErr?.message || "No se pudo finalizar claim.",
    );
  }

  return c.json({
    ok: true as const,
    device_id: deviceId,
    minor_id: minorId,
    api_key: apiKey,
  });
});

apiRouter.post("/notifications/analyze", async (c) => {
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const minorId = record["minor_id"];
  if (typeof minorId !== "string" || !isUuid(minorId)) {
    return writeProblem(
      c,
      ApiErrorCode.INVALID_UUID,
      "minor_id es obligatorio y debe ser un UUID válido.",
    );
  }

  const textPreview = record["text_preview"];
  if (typeof textPreview !== "string" || textPreview.trim().length < 3) {
    return writeProblem(
      c,
      ApiErrorCode.TEXT_TOO_SHORT,
      "text_preview es obligatorio y debe tener contenido suficiente.",
    );
  }

  const description =
    typeof record["description"] === "string" && record["description"].trim()
      ? record["description"].trim().slice(0, 800)
      : typeof textPreview === "string"
        ? textPreview.trim().slice(0, 800)
        : null;

  const shared = Array.isArray(record["shared_alert_levels"])
    ? (record["shared_alert_levels"] as unknown[]).filter(
        (n): n is number => typeof n === "number" && Number.isInteger(n),
      )
    : [1, 2, 3];

  const supabase = getSupabaseAdmin();
  const { data: minor, error: minorError } = await supabase
    .from("minors")
    .select("id,parent_id,age_mode,shared_alert_levels")
    .eq("id", minorId)
    .maybeSingle();
  if (minorError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorError.message || "Error al buscar menor.");
  }
  if (!minor) {
    return writeProblem(c, ApiErrorCode.MINOR_NOT_FOUND, "Menor no encontrado.");
  }
  if (!demoBypassAuthEnabled() && String(minor.parent_id) !== auth.user.id) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "No tienes permisos sobre este menor.");
  }

  const onDevice: Record<string, unknown> = {};
  if (typeof record["risk_level"] === "number") onDevice["risk_level"] = record["risk_level"];
  else if (typeof record["mock_risk_level"] === "number") onDevice["risk_level"] = record["mock_risk_level"];
  if (typeof record["confidence_score"] === "number") onDevice["confidence_score"] = record["confidence_score"];
  if (typeof record["sensitive_data_flag"] === "boolean") onDevice["sensitive_data_flag"] = record["sensitive_data_flag"];
  if (typeof record["kipi_response"] === "string") onDevice["kipi_response"] = record["kipi_response"];

  const cloudDecision = decideCloudEscalation({
    onDevice: onDevice as any,
    force_cloud: record["force_cloud"],
    cloud_confidence_threshold: record["cloud_confidence_threshold"],
  });

  const { analysis, cloud_error } = await classifyNotification({
    age_mode: (minor as any).age_mode,
    app_source: typeof record["app_source"] === "string" ? record["app_source"] : "Sistema",
    text_preview: textPreview.trim(),
    onDevice: (onDevice as any) || null,
    use_cloud: cloudDecision.use_cloud,
  });

  const sharedLevelsFromDb = Array.isArray((minor as any).shared_alert_levels)
    ? ((minor as any).shared_alert_levels as unknown[]).filter(
        (n): n is number => typeof n === "number" && Number.isInteger(n),
      )
    : null;
  const effectiveSharedLevels = sharedLevelsFromDb && sharedLevelsFromDb.length ? sharedLevelsFromDb : shared;

  const decision = decideEscalationToParent(analysis.risk_level, effectiveSharedLevels);

  const started = Date.now();

  const { data: inserted, error: insertError } = await supabase
    .from("alerts")
    .insert({
      minor_id: minorId,
      app_source: typeof record["app_source"] === "string" ? record["app_source"] : "Sistema",
      description,
      risk_level: analysis.risk_level,
      confidence_score: analysis.confidence_score,
      sensitive_data_flag: analysis.sensitive_data_flag,
      escalated_to_parent: decision.escalatedToParent,
      is_manual_help: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, insertError?.message || "Error al guardar alerta.");
  }

  return c.json({
    ok: true as const,
    analysis,
    system_action: {
      escalated_to_parent: decision.escalatedToParent,
      reason: decision.reason,
    },
    cloud: {
      used: analysis.source === "cloud",
      decision_reason: cloudDecision.reason,
      error: cloud_error,
    },
    alert_id: inserted.id,
    procesado_en_ms: Date.now() - started,
  });
});

apiRouter.get("/gamification/streak", async (c) => {
  const parentId = c.req.query("parent_id");
  if (!parentId || !isUuid(parentId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "parent_id es obligatorio y debe ser un UUID válido.");
  }
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "parent_id no coincide con el usuario autenticado.");
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("parents")
    .upsert({ id: parentId, email: auth.user.email ?? null }, { onConflict: "id" });

  // La racha en UI es el valor "de negocio" guardado en `parents.safe_days_streak`.
  // Evitamos recalcular aquí porque el seed puede contener alertas históricas (riesgo >=2)
  // que bajarían la racha a 0 aunque el usuario tenga un valor configurado.
  const { data: parent, error } = await supabase
    .from("parents")
    .select("safe_days_streak")
    .eq("id", parentId)
    .maybeSingle();
  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al cargar racha.");
  }
  const safeDaysStreak = typeof parent?.safe_days_streak === "number" ? parent.safe_days_streak : 0;
  return c.json({ ok: true as const, parent_id: parentId, safe_days_streak: safeDaysStreak });
});

type Mission = {
  id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  category: string;
};

const MISSIONS_CATALOG: Mission[] = [
  {
    id: "dif-grooming-guia-2024",
    title: "Guía rápida: Grooming",
    description: "Aprende señales, prevención y cómo actuar ante grooming en chats.",
    estimated_minutes: 6,
    category: "seguridad",
  },
  {
    id: "dif-ciberacoso-kit-2024",
    title: "Kit anti-ciberacoso",
    description: "Pasos prácticos para detectar y responder a ciberbullying.",
    estimated_minutes: 8,
    category: "convivencia",
  },
  {
    id: "dif-privacidad-basicos-2024",
    title: "Privacidad en apps",
    description: "Ajustes básicos y hábitos para proteger datos personales.",
    estimated_minutes: 7,
    category: "privacidad",
  },
];

apiRouter.get("/gamification/missions", async (c) => {
  const parentId = c.req.query("parent_id");
  if (!parentId || !isUuid(parentId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "parent_id es obligatorio y debe ser un UUID válido.");
  }
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "parent_id no coincide con el usuario autenticado.");
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("parents")
    .upsert({ id: parentId, email: auth.user.email ?? null }, { onConflict: "id" });

  const { data: parent, error } = await supabase
    .from("parents")
    .select("completed_missions")
    .eq("id", parentId)
    .maybeSingle();
  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al cargar misiones.");
  }
  const completed = Array.isArray(parent?.completed_missions) ? (parent?.completed_missions as unknown[]) : [];
  const completedIds = new Set(completed.filter((s): s is string => typeof s === "string"));

  const missions = MISSIONS_CATALOG.map((m) => ({ ...m, is_completed: completedIds.has(m.id) }));
  const missions_completed_count = missions.filter((m) => m.is_completed).length;
  return c.json({ ok: true as const, parent_id: parentId, missions, missions_completed_count });
});

apiRouter.post("/gamification/missions/complete", async (c) => {
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const parentId = record["parent_id"];
  const missionId = record["mission_id"];
  if (typeof parentId !== "string" || !isUuid(parentId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "parent_id es obligatorio y debe ser un UUID válido.");
  }
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.AUTH_REQUIRED, "parent_id no coincide con el usuario autenticado.");
  }
  if (typeof missionId !== "string" || !missionId.trim()) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "mission_id es obligatorio.");
  }

  const exists = MISSIONS_CATALOG.some((m) => m.id === missionId);
  if (!exists) {
    return writeProblem(c, ApiErrorCode.MISSION_NOT_FOUND, "mission_id no existe.");
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("parents")
    .upsert({ id: parentId, email: auth.user.email ?? null }, { onConflict: "id" });

  const { data: parent, error } = await supabase
    .from("parents")
    .select("completed_missions")
    .eq("id", parentId)
    .maybeSingle();
  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al cargar misiones.");
  }
  const completed = Array.isArray(parent?.completed_missions) ? (parent?.completed_missions as unknown[]) : [];
  const completedIds = completed.filter((s): s is string => typeof s === "string");
  const already = completedIds.includes(missionId);
  const next = already ? completedIds : [...completedIds, missionId];

  const { error: updateError } = await supabase
    .from("parents")
    .update({ completed_missions: next })
    .eq("id", parentId);
  if (updateError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, updateError.message || "Error al completar misión.");
  }

  return c.json({
    ok: true as const,
    mission_id: missionId,
    missions_completed_count: next.length,
    already_completed: already,
  });
});

apiRouter.post("/assistant/chat", async (c) => {
  const auth = await requireSupabaseUser(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;

  const parentId = typeof record["parent_id"] === "string" ? record["parent_id"] : "";
  if (!parentId || !isUuid(parentId)) {
    return writeProblem(c, ApiErrorCode.INVALID_UUID, "parent_id es obligatorio y debe ser un UUID válido.");
  }
  if (!demoBypassAuthEnabled() && auth.user.id !== parentId) {
    return writeProblem(c, ApiErrorCode.FORBIDDEN, "No tienes permisos para usar el asistente con ese parent_id.");
  }

  const message = typeof record["message"] === "string" ? record["message"] : "";
  const trimmed = message.trim();
  if (trimmed.length < 3) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "message es obligatorio y debe tener al menos 3 caracteres.");
  }

  const uiContext = typeof record["ui_context"] === "object" && record["ui_context"] ? record["ui_context"] : null;

  const started = Date.now();
  const supabase = getSupabaseAdmin();

  const [{ data: minors, error: minorsError }, { data: parentRow, error: parentError }] = await Promise.all([
    supabase
      .from("minors")
      .select("id,name,age_mode,shared_alert_levels,created_at")
      .eq("parent_id", parentId)
      .order("created_at", { ascending: true }),
    supabase
      .from("parents")
      .select("safe_days_streak,completed_missions,created_at")
      .eq("id", parentId)
      .maybeSingle(),
  ]);

  if (minorsError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorsError.message || "Error al cargar menores.");
  }
  if (parentError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, parentError.message || "Error al cargar perfil del padre.");
  }

  const minorIds = (minors ?? []).map((m: any) => m.id).filter((id: any) => typeof id === "string");
  const { data: recentAlerts } = minorIds.length
    ? await supabase
        .from("alerts")
        .select("id,minor_id,app_source,risk_level,sensitive_data_flag,escalated_to_parent,created_at")
        .in("minor_id", minorIds)
        .order("created_at", { ascending: false })
        .limit(25)
    : { data: [] as any[] };

  const dashboardContext = {
    parent_id: parentId,
    parent: {
      safe_days_streak: (parentRow as any)?.safe_days_streak ?? null,
      completed_missions: (parentRow as any)?.completed_missions ?? null,
      created_at: (parentRow as any)?.created_at ?? null,
    },
    minors: (minors ?? []).map((m: any) => ({
      id: m.id,
      name: m.name,
      age_mode: m.age_mode,
      shared_alert_levels: m.shared_alert_levels ?? [1, 2, 3],
      created_at: m.created_at ?? null,
    })),
    recent_alerts: (recentAlerts ?? []).map((a: any) => ({
      id: a.id,
      minor_id: a.minor_id,
      app_source: a.app_source,
      risk_level: a.risk_level,
      sensitive_data_flag: a.sensitive_data_flag,
      escalated_to_parent: a.escalated_to_parent,
      created_at: a.created_at,
    })),
    ui_context: uiContext,
    constraints: {
      firewall_ciego: "Kipi Safe no lee chats; trabaja con alertas, acuerdos y recomendaciones educativas.",
    },
  };

  const geminiMock =
    String(process.env["GEMINI_MOCK"] ?? "")
      .trim()
      .toLowerCase() in { "1": true, true: true, yes: true, on: true };

  const apiKey = String(process.env["GEMINI_API_KEY"] ?? "").trim();
  const model = String(process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash-lite").trim() || "gemini-2.5-flash-lite";

  function mockAssistantResponse(m: string): string {
    const lower = m.toLowerCase();
    if (lower.includes("racha") || lower.includes("streak")) {
      return (
        "La Racha de Paz Mental cuenta días consecutivos (UTC) sin alertas de nivel 2 o 3 en tus menores.\n" +
        "- Si hoy hubo una alerta nivel 2/3, la racha puede bajar.\n" +
        "- Para subirla, revisa alertas recientes y refuerza acuerdos + misiones educativas.\n"
      );
    }
    if (lower.includes("misión") || lower.includes("mision")) {
      return (
        "Las Misiones son lecturas cortas para fortalecer crianza digital.\n" +
        "- Abre una misión y márcala como completada.\n" +
        "- Se guarda en tu perfil y ayuda a mantener hábitos.\n"
      );
    }
    if (lower.includes("alerta") || lower.includes("nivel")) {
      return (
        "Puedo ayudarte a interpretar alertas.\n" +
        "- Nivel 1: informativa.\n" +
        "- Nivel 2: requiere atención y conversación.\n" +
        "- Nivel 3: prioridad alta; considera apoyo profesional si hay riesgo.\n" +
        "Dime qué alerta te preocupa (app y nivel) y qué objetivo tienes (prevención, conversación, seguimiento)."
      );
    }
    return (
      "Puedo ayudarte a usar el dashboard y entender alertas, acuerdos de privacidad y misiones.\n" +
      "Dime qué parte te interesa (alertas, acuerdos por edad, racha, misiones) y qué objetivo tienes hoy."
    );
  }

  if (geminiMock || !apiKey) {
    const reply = mockAssistantResponse(trimmed);
    return c.json({ ok: true as const, reply, procesado_en_ms: Date.now() - started, mock: true });
  }

  const userMessage =
    "Contexto del dashboard (JSON; puede ser null en campos):\n" +
    `${JSON.stringify(dashboardContext)}\n\n` +
    "Pregunta del padre:\n" +
    trimmed;

  const result = await geminiGenerateText({
    apiKey,
    model,
    systemInstruction: PARENT_DASHBOARD_ASSISTANT_SYSTEM_PROMPT,
    userMessage,
    temperature: 0.45,
    timeoutMs: 12_000,
  });

  if (!result.ok) {
    const raw = String(result.error || "").toLowerCase();
    const is429 = raw.includes("429") || raw.includes("too many requests") || raw.includes("spending cap");
    if (process.env["NODE_ENV"] !== "production" && is429) {
      const reply = mockAssistantResponse(trimmed);
      return c.json({ ok: true as const, reply, procesado_en_ms: Date.now() - started, mock: true });
    }
    return writeProblem(c, ApiErrorCode.MODEL_PROVIDER_ERROR, result.error || "Error al llamar al modelo.");
  }

  return c.json({ ok: true as const, reply: result.text, procesado_en_ms: Date.now() - started });
});

// -------------------------
// Android device ingestion
// -------------------------

apiRouter.get("/device/me", async (c) => {
  const auth = await requireDevice(c);
  if (!auth.ok) return auth.response;
  return c.json({ ok: true as const, device_id: auth.data.deviceId, minor_id: auth.data.minorId });
});

apiRouter.post("/device/heartbeat", async (c) => {
  const auth = await requireDevice(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const battery = typeof record["battery"] === "number" ? Math.max(0, Math.min(100, Math.round(record["battery"]))) : null;
  const status = typeof record["status"] === "string" ? record["status"] : null;
  const protectionActive =
    typeof record["protection_active"] === "boolean" ? record["protection_active"] : null;

  const patch: Record<string, unknown> = {
    last_seen: new Date().toISOString(),
    last_sync: new Date().toISOString(),
  };
  if (battery != null) patch["battery"] = battery;
  if (status === "online" || status === "offline") patch["status"] = status;
  if (protectionActive != null) patch["protection_active"] = protectionActive;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("devices").update(patch).eq("id", auth.data.deviceId);
  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "No se pudo actualizar heartbeat.");
  }
  return c.json({ ok: true as const });
});

apiRouter.post("/device/alerts", async (c) => {
  const auth = await requireDevice(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;

  const riskRaw = typeof record["risk_level"] === "number" ? record["risk_level"] : 2;
  let risk;
  try {
    risk = assertRiskLevel(riskRaw);
  } catch {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "risk_level inválido (usa 1, 2 o 3).");
  }

  const description =
    typeof record["description"] === "string" && record["description"].trim()
      ? record["description"].trim().slice(0, 800)
      : null;

  const confidence =
    typeof record["confidence_score"] === "number" ? Math.max(0, Math.min(1, record["confidence_score"])) : 0.8;
  const sensitive = Boolean(record["sensitive_data_flag"]);
  const appSource = typeof record["app_source"] === "string" && record["app_source"].trim()
    ? record["app_source"].trim().slice(0, 80)
    : "Android";

  const supabase = getSupabaseAdmin();
  const { data: minor, error: minorError } = await supabase
    .from("minors")
    .select("shared_alert_levels")
    .eq("id", auth.data.minorId)
    .maybeSingle();
  if (minorError) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, minorError.message || "Error al buscar menor.");
  }

  const shared = Array.isArray((minor as any)?.shared_alert_levels)
    ? (((minor as any).shared_alert_levels as unknown[]) ?? []).filter((n: unknown): n is number => typeof n === "number")
    : [1, 2, 3];
  const decision = decideEscalationToParent(risk, shared);

  const { data: inserted, error } = await supabase
    .from("alerts")
    .insert({
      minor_id: auth.data.minorId,
      app_source: appSource,
      description,
      risk_level: risk,
      confidence_score: confidence,
      sensitive_data_flag: sensitive,
      escalated_to_parent: decision.escalatedToParent,
      is_manual_help: false,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error?.message || "Error al guardar alerta.");
  }

  return c.json({
    ok: true as const,
    alert_id: inserted.id,
    system_action: { escalated_to_parent: decision.escalatedToParent, reason: decision.reason },
  });
});

apiRouter.post("/device/screen-time/batch", async (c) => {
  const auth = await requireDevice(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const rows = Array.isArray(record["rows"]) ? (record["rows"] as any[]) : [];
  if (rows.length === 0) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "rows es obligatorio (array no vacío).");
  }

  const normalized = rows
    .map((r) => ({
      minor_id: auth.data.minorId,
      app_name: typeof r?.app_name === "string" ? r.app_name.slice(0, 120) : null,
      category: typeof r?.category === "string" ? r.category.slice(0, 80) : "Otros",
      minutes: typeof r?.minutes === "number" ? Math.max(0, Math.round(r.minutes)) : 0,
      log_date: typeof r?.log_date === "string" ? r.log_date : null,
    }))
    .filter((r) => Boolean(r.app_name) && Boolean(r.log_date));

  if (normalized.length === 0) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "No hay filas válidas (requiere app_name y log_date).");
  }

  const supabase = getSupabaseAdmin();
  // Upsert por unique(minor_id, app_name, log_date)
  const { error } = await supabase
    .from("screen_time_logs")
    .upsert(normalized, { onConflict: "minor_id,app_name,log_date" });
  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al upsert screen_time_logs.");
  }
  await supabase
    .from("devices")
    .update({ last_seen: new Date().toISOString(), last_sync: new Date().toISOString(), status: "online" })
    .eq("id", auth.data.deviceId);

  return c.json({ ok: true as const, inserted: normalized.length });
});

apiRouter.post("/device/app-events/batch", async (c) => {
  const auth = await requireDevice(c);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const record = body as Record<string, unknown>;
  const events = Array.isArray(record["events"]) ? (record["events"] as any[]) : [];
  if (events.length === 0) {
    return writeProblem(c, ApiErrorCode.TEXT_TOO_SHORT, "events es obligatorio (array no vacío).");
  }

  const normalized = events
    .map((e) => ({
      minor_id: auth.data.minorId,
      app_name: typeof e?.app_name === "string" ? e.app_name.slice(0, 120) : null,
      event_type: typeof e?.event_type === "string" ? e.event_type : "installed",
      category: typeof e?.category === "string" ? e.category.slice(0, 80) : "Otros",
      risk_level: typeof e?.risk_level === "string" ? e.risk_level : "low",
      created_at: typeof e?.created_at === "string" ? e.created_at : new Date().toISOString(),
    }))
    .filter((e) => Boolean(e.app_name));

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_events").insert(normalized);
  if (error) {
    return writeProblem(c, ApiErrorCode.INTERNAL_ERROR, error.message || "Error al insertar app_events.");
  }

  await supabase
    .from("devices")
    .update({ last_seen: new Date().toISOString(), last_sync: new Date().toISOString(), status: "online" })
    .eq("id", auth.data.deviceId);

  return c.json({ ok: true as const, inserted: normalized.length });
});
