import { geminiGenerateText } from "../model-providers/gemini.js";
import { selectPrompt } from "./prompts.js";

export type NotificationAnalysis = {
  risk_level: 1 | 2 | 3;
  confidence_score: number; // 0..1
  sensitive_data_flag: boolean;
  kipi_response: string;
  /**
   * Fuente de la clasificación final.
   * - on_device: proviene del SLM/heurística del dispositivo
   * - cloud: reclasificado con Gemini en servidor
   */
  source: "on_device" | "cloud";
};

export type OnDeviceInput = {
  risk_level?: number;
  confidence_score?: number;
  sensitive_data_flag?: boolean;
  kipi_response?: string;
};

export type CloudDecision = {
  use_cloud: boolean;
  reason: string;
};

const DEFAULT_CLOUD_CONFIDENCE_THRESHOLD = 0.78;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function assertRiskLevel(n: number): 1 | 2 | 3 {
  if (n === 1 || n === 2 || n === 3) return n;
  throw new Error("risk_level inválido");
}

function shouldUseGeminiMock(): boolean {
  const v = String(process.env["GEMINI_MOCK"] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function runMockCloudClassification(textPreview: string): Omit<NotificationAnalysis, "source"> {
  const t = textPreview.toLowerCase();
  const looksLikeSensitive =
    /cvv|cvc|tarjeta|card|contraseñ|password|otp|c[oó]digo|cuenta banc|clabe|iban|curp|rfc|direcci[oó]n|ubicaci[oó]n/i.test(
      textPreview,
    );
  const risk_level: 1 | 2 | 3 =
    looksLikeSensitive || /amenaz|chantaj|suicid|sext|desn|foto|trabajo fácil|dinero fácil|dep[oó]sito/i.test(t)
      ? 3
      : /p[aá]same tu|manda tu|d[oó]nde vives|ubicaci[oó]n|ven solo|nos vemos/i.test(t)
        ? 2
        : 1;
  const confidence_score = looksLikeSensitive ? 0.92 : risk_level === 3 ? 0.82 : risk_level === 2 ? 0.72 : 0.64;
  return {
    risk_level,
    confidence_score,
    sensitive_data_flag: looksLikeSensitive,
    kipi_response:
      risk_level === 3
        ? "Esto podría ser peligroso. No compartas datos personales ni financieros. Si te sientes presionado/a, busca ayuda de un adulto de confianza."
        : risk_level === 2
          ? "Ten cuidado con lo que compartes. Si algo te incomoda, detén la conversación y pide apoyo."
          : "Si algo te parece raro, confía en tu intuición y coméntalo con un adulto de confianza.",
  };
}

export function decideCloudEscalation(input: {
  onDevice: OnDeviceInput | null;
  force_cloud?: unknown;
  cloud_confidence_threshold?: unknown;
}): CloudDecision {
  if (Boolean(input.force_cloud)) {
    return { use_cloud: true, reason: "force_cloud=true" };
  }

  const thr =
    typeof input.cloud_confidence_threshold === "number" && Number.isFinite(input.cloud_confidence_threshold)
      ? clamp01(input.cloud_confidence_threshold)
      : DEFAULT_CLOUD_CONFIDENCE_THRESHOLD;

  const r = input.onDevice?.risk_level;
  const c = input.onDevice?.confidence_score;
  if (typeof r !== "number") return { use_cloud: true, reason: "sin risk_level on-device (fallback a nube)" };
  if (typeof c !== "number") return { use_cloud: true, reason: "sin confidence_score on-device (fallback a nube)" };

  // Regla principal: si el dispositivo sospecha (>=2) pero tiene baja confianza, pedimos una clasificación más potente.
  if (r >= 2 && clamp01(c) < thr) {
    return { use_cloud: true, reason: `confianza baja on-device (${String(c)} < ${String(thr)})` };
  }

  return { use_cloud: false, reason: "confianza suficiente on-device" };
}

function parseAndValidateGeminiJson(raw: string): Omit<NotificationAnalysis, "source"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("La respuesta del modelo no es JSON válido.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("La respuesta del modelo no tiene el formato esperado.");
  const o = parsed as Record<string, unknown>;

  const risk_level = o["risk_level"];
  const confidence_score = o["confidence_score"];
  const sensitive_data_flag = o["sensitive_data_flag"];
  const kipi_response = o["kipi_response"];

  if (typeof risk_level !== "number") throw new Error("risk_level debe ser número.");
  const risk = assertRiskLevel(Math.trunc(risk_level));

  if (typeof confidence_score !== "number" || Number.isNaN(confidence_score)) {
    throw new Error("confidence_score debe ser número.");
  }
  const conf = clamp01(confidence_score);

  if (typeof sensitive_data_flag !== "boolean") throw new Error("sensitive_data_flag debe ser booleano.");
  if (typeof kipi_response !== "string" || !kipi_response.trim()) throw new Error("kipi_response debe ser texto.");

  return {
    risk_level: risk,
    confidence_score: conf,
    sensitive_data_flag,
    kipi_response: kipi_response.trim(),
  };
}

export async function classifyNotification(input: {
  age_mode: unknown;
  app_source: string;
  text_preview: string;
  onDevice: OnDeviceInput | null;
  use_cloud: boolean;
}): Promise<{ analysis: NotificationAnalysis; cloud_error: string | null }> {
  if (!input.use_cloud) {
    const r = typeof input.onDevice?.risk_level === "number" ? input.onDevice.risk_level : 2;
    const c = typeof input.onDevice?.confidence_score === "number" ? input.onDevice.confidence_score : 0.8;
    const risk = assertRiskLevel(Math.trunc(r));
    const conf = clamp01(c);
    const sensitive = Boolean(input.onDevice?.sensitive_data_flag);
    const kipi = typeof input.onDevice?.kipi_response === "string" && input.onDevice.kipi_response.trim()
      ? input.onDevice.kipi_response.trim().slice(0, 500)
      : "Análisis recibido.";

    return {
      analysis: {
        risk_level: risk,
        confidence_score: conf,
        sensitive_data_flag: sensitive,
        kipi_response: kipi,
        source: "on_device",
      },
      cloud_error: null,
    };
  }

  // Cloud path: Gemini classification (or mock).
  try {
    if (shouldUseGeminiMock()) {
      const mock = runMockCloudClassification(input.text_preview);
      return {
        analysis: { ...mock, source: "cloud" },
        cloud_error: null,
      };
    }

    const apiKey = String(process.env["GEMINI_API_KEY"] ?? "").trim();
    if (!apiKey) throw new Error("Falta GEMINI_API_KEY.");
    const model = String(process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash-lite").trim() || "gemini-2.5-flash-lite";

    const systemInstruction = selectPrompt(input.age_mode);
    const userMessage =
      `Origen de la notificación (paquete o app): ${input.app_source || "desconocido"}\n\n` +
      `Texto del preview de la notificación:\n${input.text_preview}`;

    const result = await geminiGenerateText({
      apiKey,
      model,
      systemInstruction,
      userMessage,
      temperature: 0.35,
      timeoutMs: 12_000,
    });

    if (!result.ok) throw new Error(result.error || "Error al llamar a Gemini.");
    const parsed = parseAndValidateGeminiJson(result.text);
    return { analysis: { ...parsed, source: "cloud" }, cloud_error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    // Fallback seguro: si la nube falla, devolvemos el análisis on-device (para no bloquear el flujo móvil).
    const r = typeof input.onDevice?.risk_level === "number" ? input.onDevice.risk_level : 2;
    const c = typeof input.onDevice?.confidence_score === "number" ? input.onDevice.confidence_score : 0.8;
    const risk = assertRiskLevel(Math.trunc(r));
    const conf = clamp01(c);
    const sensitive = Boolean(input.onDevice?.sensitive_data_flag);
    const kipi = typeof input.onDevice?.kipi_response === "string" && input.onDevice.kipi_response.trim()
      ? input.onDevice.kipi_response.trim().slice(0, 500)
      : "Análisis recibido.";

    return {
      analysis: {
        risk_level: risk,
        confidence_score: conf,
        sensitive_data_flag: sensitive,
        kipi_response: kipi,
        source: "on_device",
      },
      cloud_error: msg,
    };
  }
}

