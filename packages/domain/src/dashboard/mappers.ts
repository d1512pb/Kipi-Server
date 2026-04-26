import { hueFromString } from "./color.js";

export type ApiMinor = {
  minor_id: string;
  name?: string | null;
  age_mode?: "child" | "teen" | string | null;
  alertas_recientes?: unknown[];
  device_model?: string | null;
};

export type DashboardChildProfile = {
  id: string;
  name: string;
  age: number;
  initial: string;
  grade?: string;
  school?: string;
  color: string;
};

export type DashboardAlertLevel = "high" | "medium" | "info";

export type DashboardAlertItem = {
  id: string | number;
  level: DashboardAlertLevel;
  category: string;
  platform: string;
  timestamp: string;
  summary: string;
  intervention: string;
  read: boolean;
  patternCount: number;
  riskScore: number;
};

export function mapMinorToProfile(minor: ApiMinor): DashboardChildProfile {
  const id = minor.minor_id;
  const hue = hueFromString(id);
  const age = minor.age_mode === "child" ? 12 : 16;
  const name = minor.name || "Menor";
  return {
    id,
    name,
    age,
    initial: name.charAt(0).toUpperCase(),
    grade: "—",
    school: "—",
    color: `hsl(${hue}, 55%, 48%)`,
  };
}

export function mapApiAlert(row: any): DashboardAlertItem {
  const level: DashboardAlertItem["level"] =
    row.risk_level === 3 ? "high" : row.risk_level === 2 ? "medium" : "info";
  const fecha = row.fecha || row.created_at;
  let timestamp = "Reciente";
  try {
    const d = new Date(fecha);
    if (!Number.isNaN(d.getTime())) {
      timestamp = d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
    }
  } catch {
    // ignore
  }
  const ap = row.asistente_parental;
  const desc =
    typeof row.description === "string" && row.description.trim().length > 0
      ? String(row.description).trim().slice(0, 320)
      : null;
  const summary = desc
    ? desc
    : ap?.guia_contextual
      ? String(ap.guia_contextual).slice(0, 320)
      : `Alerta nivel ${row.risk_level} (${row.app_source || "App"})`;
  const intervention = Array.isArray(ap?.recursos)
    ? `Recursos: ${ap.recursos.join(", ")}`
    : row.sensitive_data_flag
      ? "Posible exposición de datos sensibles."
      : "";

  return {
    id: row.id,
    level,
    category: row.sensitive_data_flag ? "Datos sensibles" : `Nivel ${row.risk_level}`,
    platform: row.app_source || "Sistema",
    timestamp,
    summary,
    intervention,
    read: false,
    patternCount: 0,
    riskScore: row.risk_level === 3 ? 90 : row.risk_level === 2 ? 55 : 20,
  };
}

