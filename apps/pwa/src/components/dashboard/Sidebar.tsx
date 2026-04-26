import {
  ShieldCheck,
  LayoutDashboard,
  Bell,
  Clock,
  Lock,
  Settings,
  Zap,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "alerts", label: "Alertas", icon: Bell },
  { id: "screentime", label: "Tiempo de Pantalla", icon: Clock },
  { id: "privacy", label: "Privacidad IA", icon: Lock },
];

const BOTTOM_ITEMS: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "settings", label: "Configuración", icon: Settings },
];

export function Sidebar({
  className,
  isMobile = false,
  activeSection,
  onSectionChange,
  unreadAlerts,
}: {
  className?: string;
  isMobile?: boolean;
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  unreadAlerts: number;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoFailed, setLogoFailed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    toast.success("Sesión cerrada correctamente");
  };

  return (
    <aside className={cn("flex flex-col w-64 bg-card border-r border-border h-full", className)}>
      {isMobile && (
        <div className="h-16 flex items-center px-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              {!logoFailed ? (
                <img
                  src="/kipisafe/logo.svg"
                  alt="Kipi Safe"
                  className="w-5 h-5 object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <ShieldCheck className="w-4 h-4 text-primary-foreground" />
              )}
            </div>
            <div>
              <span className="font-display font-semibold text-foreground text-base leading-none">
                Kipi Safe
              </span>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto scrollbar-thin">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">
          Principal
        </p>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const showBadge = item.id === "alerts" && unreadAlerts > 0;
          const sectionId = `section-${item.id}`;

          return (
            <button
              key={item.id}
              onClick={() => {
                onSectionChange(item.id);
                document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-left",
                isActive
                  ? "bg-primary-subtle text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              type="button"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {showBadge ? (
                <span className="w-5 h-5 bg-warn text-warn-foreground rounded-full text-[10px] flex items-center justify-center font-bold">
                  {unreadAlerts}
                </span>
              ) : null}
            </button>
          );
        })}

        <div className="pt-5 mt-4 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">
            Plan Actual
          </p>
          <div className="mx-1 p-4 rounded-xl bg-primary-subtle border border-primary/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary font-display">Plan Básico</span>
            </div>
            <p className="text-xs text-primary/70 mb-3 leading-relaxed">
              Actualiza a Pro para añadir hasta 4 hijos y reportes semanales.
            </p>
            <button
              className="w-full py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-light transition-colors duration-150"
              type="button"
            >
              Actualizar a Pro
            </button>
          </div>
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-border space-y-0.5">
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-left",
                isActive
                  ? "bg-primary-subtle text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              type="button"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors duration-150 group mt-1">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground ring-1 ring-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-extrabold tracking-wide">
              {(user?.name || "")
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p: string) => p[0]?.toUpperCase?.() || "")
                .join("") || "TU"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name || "Ana García"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || "ana@familia.com"}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-150 shrink-0"
            title="Cerrar sesión"
            type="button"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

