## 1. Nombre del proyecto y descripción

**Kipi Safe** es el primer sistema con **Autonomía Progresiva** diseñado para **prevenir el reclutamiento criminal infantil** sin invadir la privacidad.

Nuestro enfoque es **dual**:

- **App del menor (Android, on-device)**: un “Escudo” que analiza **notificaciones** localmente con IA para detectar señales tempranas de grooming, ofertas engañosas, coacción y sobre todo prevenir el reclutamiento criminal **sin Guardar chats**.
- **App parental (PWA)**: recibe **alertas procesables** únicamente cuando existe un riesgo significativo, habilitando conversaciones y acciones oportunas.

Kipi Safe opera bajo el principio de **“Cero Retención de Datos”**: la información sensible se procesa **en el dispositivo** y no se almacena contenido privado del menor.

---

## 2. Problema que resuelve

Kipi Safe ataca directamente dos problemáticas del hackathon:

- **Contacto y ofertas engañosas** por parte de redes criminales hacia menores.
- **Falta de herramientas de detección temprana** para madres, padres y tutores.

En México, según **REDIM**, **250,000 menores** están en riesgo de ser reclutados. Las soluciones parentales tradicionales suelen fracasar por dos razones: **invaden la privacidad** y, por lo mismo, los jóvenes **las evaden o desinstalan**.  

Kipi Safe cambia el paradigma: en lugar de vigilar, **preserva la confianza**. Solo se notifica a la persona adulta responsable cuando el sistema detecta un **riesgo real** y entregamos **señales accionables**, no vigilancia constante.

---

## 3. Tecnologías y herramientas utilizadas

- **Backend** (este repositorio):
  - **Node.js + TypeScript**
  - **Hono** (API)
  - **Supabase** (`@supabase/supabase-js`) para autenticación y acceso a datos
  - **PostgreSQL** (desplegado ágilmente en **Railway**)
- **Frontend (App Parental)** (este repositorio):
  - **PWA** con **Vite + React**
  - **React Router**
  - **Tailwind CSS**
  - **Radix UI**
  - **Recharts** (visualizaciones)
- **App Nativa (Menor)**:
  - **Android Studio**, **Kotlin**, **Jetpack Compose**
- **Inteligencia Artificial**:
  - **Modelos ligeros (SLM) locales** para el “Escudo” on-device
  - **Gemini 2.5 Flash-Lite** (nube) para **clasificación profunda** de amenazas

### 3.1 Link del repositorio de la app movil

[Pega aquí el link del repositorio de la app móvil]

---

## 4. Instrucciones para ejecutar el prototipo

### Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd HCKMX26-1776486277
```

### Requisitos

- **Node.js** \(>= 20.12.0\)
- **pnpm** \(el monorepo usa `pnpm@9.15.9`\)

### Configurar variables de entorno (`.env`)

Crea un archivo `.env` en la **raíz** del repositorio (no lo publiques). Variables esperadas:

```bash
# === PWA (Vite) ===
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# === API (Hono) ===
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
```

### Instalación (monorepo)

```bash
pnpm install
```

### Backend (API)

```bash
pnpm --filter @kipi/api dev
```

La API debería quedar disponible (por defecto) en:

- `http://localhost:8788/health`

### Frontend (PWA)

En otra terminal:

```bash
pnpm --filter @kipi/pwa dev
```

La PWA debería quedar disponible (por defecto) en:

- `http://localhost:5173/`

### Ejecución integrada (API + PWA a la vez)

Si quieres levantarlo todo con un solo comando:

```bash
pnpm dev
```

### App Android (Menor)

- **Opción A (emulador/USB)**: abrir el proyecto en **Android Studio**, sincronizar Gradle y ejecutar en emulador/dispositivo.
- **Opción B (APK)**: descargar e instalar la APK del prototipo (si ya fue generada para la demo del hackathon).

---

## 5. Demo del prototipo

**🎥 [Insertar Enlace Público al Video Demo Aquí]**

---

## 6. Documentación explícita de todas las herramientas de IA utilizadas

- **Cursor AI**
  - **Para qué**: asistencia en desarrollo, aceleración de iteraciones, generación de documentación técnica y apoyo en “Vibe Coding” para prototipado rápido.
  - **En qué medida**: soporte incremental en UI, refactors, tipado y wiring de endpoints; el equipo humano validó la coherencia, seguridad y trazabilidad del sistema.
- **Gemini / ChatGPT**
  - **Para qué**: generación de **datos sintéticos hiperrealistas** para entrenar el modelo de clasificación, creando datasets que simulan **tácticas de evasión** y **jerga criminal mexicana** (sin exponer datos reales de menores).
  - **En qué medida**: se usaron como herramientas de apoyo para crear variaciones lingüísticas, escenarios y ejemplos; el equipo definió criterios, etiquetas, umbrales de riesgo y validación.

**Declaración obligatoria:** “La lógica de negocio, la arquitectura de seguridad (Firewall Ciego) y las decisiones éticas fueron dirigidas 100% por nuestro equipo”.

---

## 7. Integrantes del equipo

| Equipo | Rol principal |
|---|---|
| **José Ricardo** | Desarrollo App Móvil Android/Kotlin y despliegue |
| **Christopher** | Lógica de IA y Backend |
| **Jonathan** | Frontend Web PWA en React |
| **Daniel** | Despliegue y Desarrollo Full Stack |
| **Héctor David** | Base de Datos y Lógica PostgreSQL |