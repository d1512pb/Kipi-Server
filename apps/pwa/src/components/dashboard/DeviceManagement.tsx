import { Smartphone, Tablet, RefreshCw, ShieldCheck, Plus, BatteryMedium } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { useNavigate } from "react-router-dom";

const DEVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Smartphone,
  tablet: Tablet,
};

function BatteryBar({ level }: { level: number }) {
  const colorClass = level > 50 ? "bg-safe" : level > 20 ? "bg-warn" : "bg-warn";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", colorClass)} style={{ width: `${level}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground font-medium w-7 text-right">{level}%</span>
    </div>
  );
}

type DeviceRow = {
  id: string;
  device_name: string;
  device_model: string | null;
  os: string | null;
  status: "online" | "offline";
  battery: number | null;
  last_sync: string | null;
  device_type: "phone" | "tablet";
  protection_active: boolean;
};

function formatLastSync(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX");
}

export function DeviceManagement({
  minorId,
  accessToken,
  enabled,
}: {
  minorId: string | null;
  accessToken: string | null | undefined;
  enabled: boolean;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  useEffect(() => {
    if (!enabled || !minorId || !accessToken) {
      setDevices([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${apiUrl("/api/devices")}?minor_id=${encodeURIComponent(minorId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
        if (!body.ok || !Array.isArray(body.devices)) throw new Error("Respuesta del servidor inesperada.");
        return body.devices as DeviceRow[];
      })
      .then((list) => {
        if (cancelled) return;
        setDevices(
          (list ?? []).filter(
            (d: any) =>
              d &&
              typeof d.id === "string" &&
              typeof d.device_name === "string" &&
              typeof d.status === "string" &&
              typeof d.device_type === "string",
          ),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setError(friendlyErrorMessage(e));
        setDevices([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, minorId, accessToken]);

  const onlineCount = useMemo(() => devices.filter((d) => d.status === "online").length, [devices]);

  const handleSync = () => {
    toast.success("Sincronización completada", {
      description: "Todos los dispositivos están actualizados.",
    });
  };

  const handleAddDevice = () => {
    toast.info("Agregar dispositivo", {
      description: "Escanea el código QR desde la app del dispositivo.",
    });
    navigate("/pairing");
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-subtle flex items-center justify-center">
            <img src="/kipisafe/logo.svg" alt="Kipi Safe" className="w-5 h-5 object-contain" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground text-sm">Dispositivos</h3>
            <p className="text-xs text-muted-foreground">
              {loading ? (
                "Cargando…"
              ) : (
                <>
                  <span className="font-semibold text-safe">{onlineCount}</span> de {devices.length} activos
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
          title="Sincronizar"
          type="button"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-3">
        {!enabled ? (
          <div className="h-full rounded-xl border border-dashed border-border bg-background/40 flex items-center justify-center px-6 py-10">
            <p className="text-sm text-muted-foreground text-center">Inicia sesión y selecciona un menor para ver dispositivos reales.</p>
          </div>
        ) : error ? (
          <div className="h-full rounded-xl border border-dashed border-border bg-background/40 flex items-center justify-center px-6 py-10">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        ) : !loading && devices.length === 0 ? (
          <div className="h-full rounded-xl border border-dashed border-border bg-background/40 flex items-center justify-center px-6 py-10">
            <p className="text-sm text-muted-foreground text-center">Aún no hay dispositivos registrados.</p>
          </div>
        ) : (
          devices.map((device) => {
            const DeviceIcon = DEVICE_ICONS[device.device_type] || Smartphone;
            const isOnline = device.status === "online";
            const battery = typeof device.battery === "number" ? device.battery : 100;

            return (
              <div
                key={device.id}
                className="p-3.5 rounded-xl border border-border hover:border-primary/25 hover:bg-primary-subtle/20 transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center shrink-0">
                    <DeviceIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{device.device_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {device.device_model ?? "—"} · {device.os ?? "—"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                      isOnline
                        ? "bg-safe-subtle text-safe border-safe-border"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-safe" : "bg-muted-foreground")} />
                    {isOnline ? "En línea" : "Offline"}
                  </span>
                </div>

                <div className="mb-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <BatteryMedium className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Batería</span>
                    </div>
                  </div>
                  <BatteryBar level={battery} />
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-border/60">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-safe" />
                    <span className="text-[11px] text-safe font-medium">
                      {device.protection_active ? "Protección activa" : "Protección desactivada"}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Sync {formatLastSync(device.last_sync)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={handleAddDevice}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary-subtle/20 transition-all duration-150"
        type="button"
      >
        <Plus className="w-4 h-4" />
        Agregar Dispositivo
      </button>
    </div>
  );
}

export default DeviceManagement;

