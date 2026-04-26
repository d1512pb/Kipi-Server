import { Menu, ShieldCheck, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChildProfile } from "./types";

export function Header({
  onMenuClick,
  activeChildIndex,
  onChildChange,
  profiles,
  onAddDevice,
}: {
  onMenuClick: () => void;
  activeChildIndex: number;
  onChildChange: (index: number) => void;
  profiles: ChildProfile[];
  onAddDevice?: () => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-3 shrink-0 z-30 shadow-xs">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-primary">
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
          <div className="hidden sm:block">
            <span className="font-display font-semibold text-foreground text-base leading-none">
              Kipi Safe
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-1 bg-muted rounded-full p-1">
          {profiles.map((child, index) => (
            <button
              key={String(child.id)}
              onClick={() => onChildChange(index)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150",
                activeChildIndex === index
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              type="button"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: `hsl(${child.color.replace("hsl(", "").replace(")", "")} / 0.15)`,
                  color: child.color,
                }}
              >
                {child.initial}
              </div>
              <span>
                {child.device_model 
                  ? child.device_model 
                  : (child.name === "Dispositivo vinculado" ? "Dispositivo vinculado" : child.name)}
              </span>
              <span className="text-xs text-muted-foreground hidden md:inline">{child.age} años</span>
            </button>
          ))}
          {onAddDevice && (
            <button
              onClick={onAddDevice}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-card/50 text-muted-foreground hover:text-foreground hover:bg-card shadow-xs transition-colors duration-150 ml-1"
              title="Agregar Dispositivo"
              type="button"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;

