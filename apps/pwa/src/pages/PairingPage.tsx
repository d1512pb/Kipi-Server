import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck,
  Smartphone,
  Link2,
  Hash,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { cn } from "@/lib/utils";
import { apiUrl, messageFromApiJson } from "@/lib/api";

type ConfirmCodeResponse =
  | { ok: true; minor_id: string; message?: string }
  | { ok: false; error?: string; message?: string };

export default function PairingPage() {
  const { user, authLoading, completePairing, refreshBackendState } = useAuth();
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [pairingState, setPairingState] = useState<"idle" | "loading" | "success">("idle");
  const [pairedMinorId, setPairedMinorId] = useState<string | null>(null);

  const normalizedOtp = useMemo(() => otp.trim().toUpperCase(), [otp]);
  const canSubmit = normalizedOtp.length === 6 && !!user?.id;
  const isLoading = pairingState === "loading";
  const isSuccess = pairingState === "success";

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isLoading || isSuccess) return;

    setPairingState("loading");
    try {
      const res = await fetch(apiUrl("/api/pairing/confirm-code"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp: normalizedOtp, parent_id: user.id }),
      });

      const data = (await res.json().catch(() => null)) as ConfirmCodeResponse | Record<string, unknown> | null;
      if (!res.ok || !data || !("ok" in data) || data.ok !== true) {
        const msg = messageFromApiJson(
          data,
          res,
          "No se pudo validar el código. ¿Misma API que el móvil? ¿Letras correctas (sin O/I/0/1)?",
        );
        toast.error(msg);
        setPairingState("idle");
        return;
      }

      const okData = data as Extract<ConfirmCodeResponse, { ok: true }>;
      setPairedMinorId(typeof okData.minor_id === "string" ? okData.minor_id : null);
      toast.success(
        typeof okData.message === "string" && okData.message.trim()
          ? okData.message
          : "Dispositivo vinculado correctamente.",
      );
      await refreshBackendState?.();
      await completePairing?.();
      setPairingState("success");
      window.setTimeout(() => navigate("/dashboard"), 900);
    } catch (err) {
      toast.error(
        `Error de red al confirmar (${apiUrl("/api/pairing/confirm-code")}). ¿La API está en marcha y la base URL coincide con el celular?`,
      );
      console.error(err);
      setPairingState("idle");
    } finally {
      // keep state
    }
  };

  const STEPS = [
    {
      n: 1,
      Icon: Smartphone,
      title: "Abre la app en el celular",
      desc: "Instala y abre ‘Kipi Safe’ en el dispositivo de tu hijo/a.",
    },
    {
      n: 2,
      Icon: Link2,
      title: "Ve a ‘Vincular con mis padres’",
      desc: "Encontrarás esta opción en el menú principal de la app.",
    },
    {
      n: 3,
      Icon: Hash,
      title: "Ingresa el código de 6 caracteres",
      desc: "El código aparecerá en la pantalla del celular de tu hijo/a.",
    },
  ] as const;

  const ProgressStep = ({
    step,
    label,
    active,
    complete,
  }: {
    step: number;
    label: string;
    active?: boolean;
    complete?: boolean;
  }) => (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300",
          complete
            ? "bg-emerald-600 border-emerald-600 text-white"
            : active
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-muted border-border text-muted-foreground",
        )}
      >
        {complete ? <CheckCircle2 className="w-4 h-4" /> : step}
      </div>
      <span
        className={cn(
          "text-[10px] font-medium hidden sm:block",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 bg-card border-b border-border flex items-center px-5 lg:px-8 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold text-foreground">Kipi Safe</span>
        </div>
        {user && (
          <span className="ml-auto text-sm text-muted-foreground hidden sm:block">
            Hola, <span className="font-medium text-foreground">{user.name}</span>
          </span>
        )}
      </header>

      <div className="bg-card border-b border-border px-5 py-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-0">
            <ProgressStep step={1} label="Cuenta" complete />
            <div className="flex-1 h-0.5 bg-primary mx-2 rounded-full" />
            <ProgressStep step={2} label="Vincular" active={!isSuccess} complete={isSuccess} />
            <div
              className={cn(
                "flex-1 h-0.5 mx-2 rounded-full transition-colors duration-500",
                isSuccess ? "bg-primary" : "bg-border",
              )}
            />
            <ProgressStep step={3} label="Dashboard" active={false} complete={false} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start sm:items-center justify-center p-5 sm:p-8 pt-8">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 sm:p-8">
            {isSuccess ? (
              <div className="text-center py-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="font-display font-bold text-foreground text-xl mb-2">
                  ¡Dispositivo vinculado!
                </h2>
                <p className="text-sm text-muted-foreground">Redirigiendo al dashboard…</p>
                {pairedMinorId ? (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Minor: <code className="font-mono">{pairedMinorId}</code>
                  </p>
                ) : null}
                <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mt-4" />
              </div>
            ) : (
              <>
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="w-10 h-10 text-primary" />
                  </div>
                  <div className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-xl bg-emerald-500/10 border-2 border-card flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>

                <div className="text-center mb-7">
                  <h1 className="font-display font-bold text-foreground text-xl sm:text-2xl leading-tight">
                    Conecta el dispositivo de tu hijo
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1.5">de forma segura y privada</p>
                </div>

                <div className="space-y-4 mb-7 p-4 rounded-xl bg-muted/50 border border-border">
                  {STEPS.map((step) => {
                    const Icon = step.Icon;
                    return (
                      <div key={step.n} className="flex gap-3.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/10 border border-primary/15">
                          <span className="text-xs font-bold text-primary">{step.n}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                            <p className="text-sm font-semibold text-foreground">{step.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={onConfirm} className="space-y-4">
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-foreground text-center mb-4">
                      Ingresa el código de 6 caracteres
                    </p>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={normalizedOtp}
                        onChange={(val) => setOtp(String(val || "").toUpperCase())}
                        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                        disabled={isLoading}
                      >
                        <InputOTPGroup className="gap-1.5">
                          <InputOTPSlot index={0} className="h-14 w-12 text-xl font-bold rounded-xl border-2" />
                          <InputOTPSlot index={1} className="h-14 w-12 text-xl font-bold border-2" />
                          <InputOTPSlot index={2} className="h-14 w-12 text-xl font-bold rounded-none border-2" />
                        </InputOTPGroup>
                        <div
                          role="separator"
                          className="mx-2 text-2xl font-light text-muted-foreground select-none"
                        >
                          &mdash;
                        </div>
                        <InputOTPGroup className="gap-1.5">
                          <InputOTPSlot index={3} className="h-14 w-12 text-xl font-bold rounded-none border-2" />
                          <InputOTPSlot index={4} className="h-14 w-12 text-xl font-bold border-2" />
                          <InputOTPSlot index={5} className="h-14 w-12 text-xl font-bold rounded-xl border-2" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <p className="mt-4 text-xs text-center text-muted-foreground leading-relaxed">
                      El código lo genera la app en el celular del menor (válido 15 minutos). Solo letras y
                      números (sin O, I, 0 ni 1).
                    </p>
                  </div>

                  <Button className="w-full h-12 font-semibold text-base gap-2" type="submit" disabled={!canSubmit || isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Vinculando…
                      </>
                    ) : (
                      <>
                        Vincular dispositivo y continuar
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 mt-5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <p className="text-xs text-muted-foreground">
              Conexión cifrada. Sin acceso a mensajes privados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

