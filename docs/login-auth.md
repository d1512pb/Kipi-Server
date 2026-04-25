# Login y autenticación (PWA) — estado actual

## Dónde está el código

| Pieza | Ubicación |
| --- | --- |
| Página de login (UI: iniciar sesión, registro, olvidé contraseña) | `apps/pwa/src/pages/LoginPage.tsx` |
| Estado de sesión y acciones de auth | `apps/pwa/src/context/AuthContext.jsx` |
| Cliente Supabase (opcional) | `apps/pwa/src/lib/supabaseClient.ts` |
| Rutas y rutas protegidas | `apps/pwa/src/main.tsx` |

## Dos modos de operación

1. **Con Supabase**  
   Si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, se crea el cliente y se usan `signInWithPassword`, `signUp`, `signOut` y la suscripción a sesión.

2. **Modo demo (mock)**  
   Si faltan esas variables, `supabase` es `null`. No se crashea la app. El login usa una lista en memoria (`MOCK_USERS` en `AuthContext.jsx`).

## Credenciales de demo (mock)

- **Correo:** `ana@familia.com`  
- **Contraseña:** `demo123`  

Tras un login correcto, la navegación depende de `isNewUser` (en mock, Ana no es usuario nuevo y va al dashboard según la lógica del formulario).

## Qué hace la pantalla de login

- Pestañas **Iniciar sesión** / **Crear cuenta** (vista móvil y escritorio).
- Formulario de correo + contraseña (con mostrar/ocultar contraseña).
- Enlace a flujo **¿Olvidaste tu contraseña?** (simulado con delay y toast; no envía correo real en mock).
- **No hay** botones de Google ni Apple; el sprint es solo email/contraseña.

## Rutas relevantes

- `/login` — página pública de autenticación.
- `/` — redirige a `/dashboard` si hay sesión (vía layout privado).
- Rutas bajo el layout privado: si no hay usuario, redirección a `/login`.

## Notas para el siguiente sprint

- OAuth (Google/Apple) queda fuera hasta definir proyecto en consola, URLs de callback y políticas.
- Cuando se active Supabase en producción, revisar políticas RLS, tabla `parents` y el endpoint que usa `fetchDashboardMinorsCount` para `isNewUser` / pairing.


