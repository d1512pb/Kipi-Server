import React from 'react';
import { ShieldCheck, Check, Quote } from "lucide-react";

const FEATURES = [
  "Alertas sin leer mensajes privados",
  "IA detecta grooming y sextorsión en tiempo real",
  "Consejo de psicólogo en cada alerta crítica",
  "Cumple COPPA, GDPR y LFPDPPP — certificado",
];

const STATS = [
  { value: "1,452+", label: "Familias activas" },
  { value: "98.7%", label: "Satisfacción" },
  { value: "0", label: "Brechas de privacidad" },
];

export const AuthBranding: React.FC = () => {
  return (
    <div className="relative hidden lg:flex lg:w-5/12 xl:w-1/2 bg-primary flex-col justify-between p-10 xl:p-14 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Glowing orbs */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary-light/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-16 w-72 h-72 bg-accent/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-light/10 rounded-full blur-2xl" />
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />
        {/* Large ghost shield */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.04]">
          <ShieldCheck
            style={{ width: 380, height: 380 }}
            className="text-primary-foreground"
          />
        </div>
      </div>

      {/* Top: Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-14">
          <div className="w-10 h-10 rounded-xl bg-primary-foreground/15 border border-primary-foreground/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <span className="font-heading font-bold text-primary-foreground text-xl leading-none tracking-wider">
              Kipi Safe
            </span>
            <p className="text-primary-foreground/45 text-xs mt-0.5">by SafetyTech</p>
          </div>
        </div>

        {/* Main Heading */}
        <div className="mb-10">
          <h1 className="font-heading font-bold text-primary-foreground text-3xl xl:text-4xl leading-tight mb-4">
            Protección inteligente.
            <br />
            Sin invadir
            <br />
            la privacidad.
          </h1>
          <p className="text-primary-foreground/65 text-base leading-relaxed max-w-sm">
            El único sistema que alerta a los padres sobre riesgos reales sin
            acceder a los mensajes privados de sus hijos.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3.5 mb-10">
          {FEATURES.map((feat) => (
            <div key={feat} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-primary-foreground/15 border border-primary-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
              <span className="text-primary-foreground/80 text-sm leading-snug">
                {feat}
              </span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="font-heading font-bold text-primary-foreground text-2xl leading-none">
                {stat.value}
              </p>
              <p className="text-primary-foreground/50 text-xs mt-1 leading-tight">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: Testimonial */}
      <div className="relative z-10">
        <div className="bg-primary-foreground/10 rounded-2xl p-5 border border-primary-foreground/10 backdrop-blur-sm">
          <Quote className="w-6 h-6 text-primary-foreground/35 mb-3" />
          <p className="text-primary-foreground/85 text-sm leading-relaxed mb-4">
            &ldquo;Kipi Safe me dio tranquilidad sin convertirme en el padre
            que espía a su hijo. Fue la mejor decisión que tomé para la
            seguridad de mi familia.&rdquo;
          </p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-light/50 border border-primary-foreground/15 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary-foreground">MR</span>
            </div>
            <div>
              <p className="text-primary-foreground text-sm font-semibold leading-none">
                María R.
              </p>
              <p className="text-primary-foreground/50 text-xs mt-0.5">
                Madre · Ciudad de México
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthBranding;
