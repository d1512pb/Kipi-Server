import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowLeft,
  MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────
// Sub-component: Password Input with show/hide toggle
// ─────────────────────────────────────────────────────────
type PasswordInputProps = {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
};

const PasswordInput = ({ value, onChange, placeholder, disabled, id }: PasswordInputProps) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder || "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
        disabled={disabled}
        className="pr-10 h-11"
        required
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Sub-component: LoginForm
// ─────────────────────────────────────────────────────────
type LoginFormProps = {
  onForgot: () => void;
  onRegister: () => void;
};

const LoginForm = ({ onForgot, onRegister }: LoginFormProps) => {
  const { login, authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = await login(email, password);
    if (result.success) {
      toast.success("\u00a1Bienvenida de vuelta!");
      navigate(result.isNewUser ? "/pairing" : "/dashboard");
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <div className="mb-7">
        <h2 className="font-display font-bold text-foreground text-2xl sm:text-3xl leading-tight">
          Bienvenida de vuelta
        </h2>
        <p className="text-muted-foreground text-sm mt-1.5">
          Accede a tu panel de protección familiar.
        </p>
      </div>

      {/* Demo hint */}
      <div className="p-3.5 rounded-xl bg-primary-subtle border border-primary/15 mb-6">
        <p className="text-xs text-primary/80 leading-relaxed">
          <span className="font-semibold text-primary">Demo:</span> Usa{" "}
          <code className="bg-primary/10 px-1 py-0.5 rounded text-[11px] font-mono">
            ana@familia.com
          </code>{" "}
          y contraseña{" "}
          <code className="bg-primary/10 px-1 py-0.5 rounded text-[11px] font-mono">
            demo123
          </code>
          {" "}para ingresar al dashboard.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium">
            Correo electrónico
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="nombre@ejemplo.com"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className="h-11"
            required
            disabled={authLoading}
            autoComplete="email"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </Label>
            <button
              type="button"
              onClick={onForgot}
              className="text-xs text-primary hover:text-primary-light transition-colors duration-150 font-medium"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={authLoading}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/8 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          className="w-full h-11 font-semibold"
          disabled={authLoading || !email || !password}
        >
          {authLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Iniciar Sesión"
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        ¿Nuevo en Kipi Safe?{" "}
        <button
          type="button"
          onClick={onRegister}
          className="text-primary font-semibold hover:text-primary-light transition-colors duration-150"
        >
          Crea tu cuenta gratis
        </button>
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Sub-component: RegisterForm
// ─────────────────────────────────────────────────────────
type RegisterFormProps = { onLogin: () => void };

const RegisterForm = ({ onLogin }: RegisterFormProps) => {
  const { register, authLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!agreed) {
      setError("Debes aceptar los términos para continuar.");
      return;
    }

    const result = await register(email, password, name);
    if (result.success) {
      toast.success("\u00a1Cuenta creada exitosamente!");
      navigate("/pairing");
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display font-bold text-foreground text-2xl sm:text-3xl leading-tight">
          Crea tu cuenta
        </h2>
        <p className="text-muted-foreground text-sm mt-1.5">
          Protege a tu familia en menos de 2 minutos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reg-name">Nombre completo</Label>
          <Input
            id="reg-name"
            type="text"
            placeholder="Tu nombre"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className="h-11"
            required
            disabled={authLoading}
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-email">Correo electrónico</Label>
          <Input
            id="reg-email"
            type="email"
            placeholder="nombre@ejemplo.com"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className="h-11"
            required
            disabled={authLoading}
            autoComplete="email"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-pass">Contraseña</Label>
            <PasswordInput
              id="reg-pass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mín. 8 caracteres"
              disabled={authLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-confirm">Confirmar</Label>
            <PasswordInput
              id="reg-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repetir"
              disabled={authLoading}
            />
          </div>
        </div>

        {/* Terms */}
        <div className="flex items-start gap-2.5 pt-1">
          <Checkbox
            id="terms"
            checked={agreed}
            onCheckedChange={(checked: boolean) => setAgreed(!!checked)}
            className="mt-0.5"
          />
          <Label
            htmlFor="terms"
            className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
          >
            Acepto los{" "}
            <a href="#" className="text-primary underline underline-offset-2">
              Términos de Servicio
            </a>
            {" "}y la{" "}
            <a href="#" className="text-primary underline underline-offset-2">
              Política de Privacidad
            </a>
          </Label>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/8 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 font-semibold"
          disabled={authLoading || !name || !email || !password || !confirm}
        >
          {authLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Crear Cuenta Gratis"
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        ¿Ya tienes cuenta?{" "}
        <button
          type="button"
          onClick={onLogin}
          className="text-primary font-semibold hover:text-primary-light transition-colors duration-150"
        >
          Iniciar sesión
        </button>
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Sub-component: ForgotForm
// ─────────────────────────────────────────────────────────
type ForgotFormProps = { onBack: () => void };

const ForgotForm = ({ onBack }: ForgotFormProps) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock: supabase.auth.resetPasswordForEmail(email)
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSent(true);
    toast.success("Correo enviado", {
      description: `Revisa tu bandeja: ${email}`,
    });
  };

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-full bg-safe-subtle border border-safe-border flex items-center justify-center mx-auto mb-5">
          <MailCheck className="w-8 h-8 text-safe" />
        </div>
        <h3 className="font-display font-bold text-foreground text-xl mb-2">
          \u00a1Correo enviado!
        </h3>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          Hemos enviado instrucciones a{" "}
          <strong className="text-foreground">{email}</strong> para restablecer
          tu contraseña. Revisa tu bandeja de entrada.
        </p>
        <Button
          variant="outline"
          onClick={onBack}
          className="w-full h-11"
        >
          Volver al inicio de sesión
        </Button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-7"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver
      </button>

      <div className="mb-6">
        <h2 className="font-display font-bold text-foreground text-2xl sm:text-3xl leading-tight">
          ¿Olvidaste tu contraseña?
        </h2>
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
          Ingresa tu correo electrónico y te enviaremos un enlace para
          restablecer tu contraseña.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">Correo electrónico</Label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="nombre@ejemplo.com"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className="h-11"
            required
            disabled={loading}
            autoComplete="email"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-semibold"
          disabled={loading || !email}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Enviar enlace de recuperación"
          )}
        </Button>
      </form>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const [view, setView] = useState<"login" | "register" | "forgot">("login");

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden bg-background">
      {/* Left: Branding panel */}
      <AuthBranding />

      {/* Right: Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 self-start sm:self-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center shadow-primary">
              <ShieldCheck className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <span className="font-display font-bold text-foreground text-lg leading-none">
                Kipi Safe
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                by SafetyTech
              </p>
            </div>
          </div>
        </div>

        {/* Mode tabs (Login / Register) — only when not on forgot view */}
        {view !== "forgot" && (
          <div className="w-full max-w-[440px] mb-6">
            <div className="flex bg-muted rounded-xl p-1">
              {([
                { id: "login", label: "Iniciar Sesión" },
                { id: "register", label: "Crear Cuenta" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-colors duration-150",
                    view === tab.id
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form container */}
        <div className="w-full max-w-[440px]">
          {view === "login" && (
            <LoginForm
              onForgot={() => setView("forgot")}
              onRegister={() => setView("register")}
            />
          )}
          {view === "register" && (
            <RegisterForm onLogin={() => setView("login")} />
          )}
          {view === "forgot" && (
            <ForgotForm onBack={() => setView("login")} />
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground mt-10 text-center">
          Protección de datos conforme a{" "}
          <span className="font-medium text-foreground">GDPR y LFPDPPP</span>
        </p>
      </div>
    </div>
  );
}
