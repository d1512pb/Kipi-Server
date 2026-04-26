import { useState } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
  Lightbulb,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertItem } from "./types";
import { getInterventionAdvice } from "@/lib/interventionAdvice";

const LEVEL_CONFIG: Record<
  AlertItem["level"],
  {
    accentColor: string;
    iconBg: string;
    iconColor: string;
    badgeBg: string;
    badgeBorder: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  high: {
    accentColor: "hsl(var(--warning))",
    iconBg: "bg-warn/10",
    iconColor: "text-warn",
    badgeBg: "bg-warn/10 text-warn",
    badgeBorder: "border-warn/25",
    label: "Riesgo Alto",
    Icon: AlertTriangle,
  },
  medium: {
    accentColor: "hsl(var(--warning) / 0.55)",
    iconBg: "bg-warn/10",
    iconColor: "text-warn",
    badgeBg: "bg-warn/10 text-warn",
    badgeBorder: "border-warn/20",
    label: "Riesgo Medio",
    Icon: AlertCircle,
  },
  info: {
    accentColor: "hsl(var(--info))",
    iconBg: "bg-info/10",
    iconColor: "text-info",
    badgeBg: "bg-info/10 text-info",
    badgeBorder: "border-info/25",
    label: "Informativo",
    Icon: Info,
  },
};

const PLATFORM_BADGE: Record<string, string> = {
  Instagram: "bg-pink-50 text-pink-700 border-pink-200",
  WhatsApp: "bg-green-50 text-green-700 border-green-200",
  Sistema: "bg-muted text-muted-foreground border-border",
  TikTok: "bg-muted text-muted-foreground border-border",
};

export function AlertCard({
  alert,
  onMarkRead,
  onDismiss,
  minorId,
  analyzeDisabled = false,
}: {
  alert: AlertItem;
  onMarkRead: (id: AlertItem["id"]) => void;
  onDismiss: (id: AlertItem["id"]) => void;
  minorId: string | number | null | undefined;
  analyzeDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = LEVEL_CONFIG[alert.level];
  const Icon = config.Icon;

  const platformClass = PLATFORM_BADGE[alert.platform] || PLATFORM_BADGE.Sistema;
  
  const isManual = Boolean((alert as any).isManual);
  const adviceData = getInterventionAdvice(alert.level, isManual);

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border overflow-hidden shadow-card card-lift",
        alert.read && "opacity-70",
      )}
      style={{ borderLeft: `4px solid ${config.accentColor}` }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
              config.iconBg,
            )}
          >
            <Icon className={cn("w-4 h-4", config.iconColor)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span
                className={cn(
                  "inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                  config.badgeBg,
                  config.badgeBorder,
                )}
              >
                {config.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border",
                  platformClass,
                )}
              >
                {alert.platform}
              </span>
              {!alert.read && <span className="w-2 h-2 rounded-full bg-warn shrink-0" />}
            </div>

            <h4 className="text-sm font-semibold font-display text-foreground">{alert.category}</h4>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:block">{alert.timestamp}</span>
            <button
              onClick={() => onDismiss(alert.id)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed pl-12">{alert.summary}</p>
        <p className="text-xs text-muted-foreground pl-12 mt-1 sm:hidden">{alert.timestamp}</p>

        <div className="mt-3 pl-12 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5 text-primary hover:bg-primary-subtle hover:text-primary px-3"
            onClick={() => {
              setExpanded(!expanded);
              if (!alert.read) onMarkRead(alert.id);
            }}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Ver Consejo de Intervención
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>

          {!alert.read && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground px-3"
              onClick={() => onMarkRead(alert.id)}
            >
              <Eye className="w-3.5 h-3.5" />
              Marcar leída
            </Button>
          )}
        </div>
      </div>

      <div
        style={{
          maxHeight: expanded ? "220px" : "0",
          overflow: "hidden",
          transition: "max-height 0.3s ease-in-out",
        }}
      >
        <div className="px-4 pb-4 pl-16">
          <div className="p-4 rounded-xl bg-primary-subtle border border-primary/12">
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Lightbulb className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-xs font-bold text-primary font-display">Consejo del Equipo de Psicología</p>
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    <Shield className="w-2.5 h-2.5" />
                    Validado
                  </span>
                </div>
                <p className="text-sm text-primary/85 leading-relaxed">{adviceData.advice}</p>
                {adviceData.resources && (
                  <ul className="mt-2.5 space-y-1">
                    {adviceData.resources.map((res, i) => (
                      <li key={i} className="text-xs font-semibold text-destructive">{res}</li>
                    ))}
                  </ul>
                )}
                {analyzeDisabled && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Análisis avanzado deshabilitado: selecciona un menor con UUID válido.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AlertCard;

