import { decideEscalationToParent } from "@kipi/domain";
import { useMemo, useState, type ReactElement } from "react";
import { useOnlineStatus } from "../hooks/use-online-status.js";
import { fetchJson } from "../lib/api-client.js";
import { apiUrl } from "../lib/api.js";

type HealthResponse = { ok: true; service: string; time: string };

export function RootRoute(): ReactElement {
  const online = useOnlineStatus();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const demo = useMemo(() => decideEscalationToParent(2, [3]), []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "min(720px, 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          borderRadius: 16,
          padding: 20,
          display: "grid",
          gap: 12,
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>Kipi Safe (PWA)</h1>
          <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
            Esqueleto de producción: tipado estricto, dominio compartido y Service
            Worker con estrategias offline-first para documentos y network-first para
            API.
          </p>
        </header>

        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          Estado de red:{" "}
          <strong style={{ color: online ? "#5eead4" : "#fb7185" }}>
            {online ? "en línea" : "sin conexión"}
          </strong>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                const data = await fetchJson<HealthResponse>(apiUrl("/health"));
                setHealth(data);
              } catch (e) {
                setHealth(null);
                setError(e instanceof Error ? e.message : "Error desconocido");
              }
            }}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(56,189,248,0.12)",
              color: "var(--text)",
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            Probar API (Railway)
          </button>
        </div>

        {health ? (
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              overflow: "auto",
              color: "var(--muted)",
            }}
          >
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : null}

        {error ? (
          <p style={{ margin: 0, color: "#fb7185", fontSize: 14 }}>{error}</p>
        ) : null}

        <footer style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
          Regla de dominio (ejemplo local, sin copiar el prototipo): riesgo 2 con
          acuerdo <code>[3]</code> →{" "}
          <strong>{demo.escalatedToParent ? "escala" : "no escala"}</strong>
          <div style={{ marginTop: 8 }}>{demo.reason}</div>
        </footer>
      </section>
    </main>
  );
}
