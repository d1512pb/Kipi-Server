# Protocolo Rápido de Pruebas (Arquitectura PWA)

Para verificar y probar la integración completa local *(End-to-End)* de la nueva arquitectura base y el sistema de Autenticación, necesitarás abrir **1 sola terminal** (Git Bash, PowerShell o la de tu editor) desde la raíz del proyecto monorepo `Kipi Safe/HCKMX26-1776486277`.

### Requisitos Previos:
Asegúrate de haber creado el archivo `.env` en la raíz del proyecto guiándote por la configuración de Supabase. Este archivo centralizará las variables para todos los paquetes (API y Frontend PWA).

---

### Terminal 1: Iniciar el Monorepo (API + Frontend PWA)

A diferencia del repositorio antiguo, nuestra nueva arquitectura `pnpm` nos permite compilar el dominio, levantar el backend (Hono) y el frontend (Vite/React) en paralelo con un solo comando.

```bash
# 1. Asegúrate de estar en la raíz del proyecto
# C:\...\HCKMX26-1776486277

# 2. Instalar dependencias (solo si es la primera vez o hay cambios)
pnpm install

# 3. Encender entorno completo en modo desarrollo
pnpm dev
```

> **Verificación Terminal 1**: Espera que la consola despliegue múltiples mensajes de éxito indicando:
> - `apps/api dev: kipi api listening on http://localhost:8787` (Tu API)
> - `apps/pwa dev: ➜ Local: http://localhost:5173/` (Tu Frontend PWA)
> No cierres esta ventana.

---

### Criterio de Éxito en QA (Autenticación Base - Fase 1)

El proyecto actualmente tiene migrado el esqueleto visual de la página de Login y el enrutamiento protegido.

1. Con el entorno en marcha (`pnpm dev`), abre en tu navegador la URL:
   `http://localhost:5173/login`

2. **Éxito esperado:**
   - **Renderizado Visual:** Verás tu hermoso diseño de `AuthBranding` con el panel lateral azul oscuro, los detalles de `Tailwind CSS` (usando tu paleta oficial) y el formulario de inicio de sesión a la derecha.
   - **Rutas Protegidas:** Si intentas ir manualmente a `http://localhost:5173/dashboard` sin iniciar sesión, el sistema (gracias a React Router v7 y `PrivateRoute`) te forzará a regresar de inmediato a `/login`.

**Notas Actuales (Para el Agente Cursor):**
Si al entrar a `/login` visualizas una pantalla en blanco con un mensaje rojo ("Algo salió mal en el renderizado"), significa que el `ErrorBoundary` ha atrapado un fallo de React (generalmente dependencias faltantes de Radix UI o imports rotos al migrar de `.jsx` a `.tsx`). Tu compañero `Cursor` utilizará el archivo `.cursor/handoff_auth.md` para arreglar esto y continuar la migración.
