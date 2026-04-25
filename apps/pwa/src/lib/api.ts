const DEFAULT_API_BASE = "https://kipi-server-production.up.railway.app";

function apiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const base = raw || DEFAULT_API_BASE;
  return base.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  if (!path) return base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

