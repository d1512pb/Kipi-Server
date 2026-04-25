# Endpoints accesibles desde móvil (PWA / App) — Kipi Safe

Esta guía documenta **los endpoints HTTP que consume el cliente móvil** (PWA o app) y cómo usarlos.

## Base URL

- **Local (dev)**: `http://localhost:8788` (puede cambiar según `PORT`)
- **Prefijo API**: `GET/POST/PATCH {BASE_URL}/api/...`

Además existe un endpoint de estado:

- `GET {BASE_URL}/health`

## Autenticación

La mayoría de endpoints requieren un **token JWT de Supabase** en el header:

- `Authorization: Bearer <access_token>`

El backend valida el token con Supabase (`supabase.auth.getUser(token)`). Si falta o es inválido, responde error.

### Autenticación de dispositivo (Android nativo)

La app Android **NO debe usar JWT de Supabase**. En su lugar, después del emparejamiento obtiene un **token propio del dispositivo**:

- `Authorization: Device <api_key>`

Ese `api_key` se emite una sola vez en `POST /api/pairing/claim` y el backend guarda **solo un hash** (`devices.api_key_hash`).

## Formato de errores

Cuando algo falla, la API usa un formato estable tipo **Problem Details** (via `writeProblem(...)`).

En general, valida:

- UUIDs en query/body (`parent_id`, `minor_id`)
- Permisos: el `parent_id` debe coincidir con el usuario autenticado, y el menor (`minor_id`) debe pertenecer al padre autenticado.

## Headers recomendados (cliente móvil)

- **JSON**:
  - `Content-Type: application/json`
  - `Accept: application/json`
- **Auth (si aplica)**:
  - `Authorization: Bearer <access_token>`

---

## Checklist antes de subir a Railway (para pruebas móviles)

### Supabase (BD)

- **Tablas/columnas requeridas**: el backend asume el esquema documentado en `docs/supabase_schema.md`.
- **Verifica que existan estas columnas** (necesarias para el flujo Android ↔ backend ↔ PWA):
  - `alerts.description`
  - `devices.api_key_hash`, `devices.last_seen`
  - `pairing_sessions.claimed_at`, `pairing_sessions.device_id`

En este repo quedaron como migraciones:

- `apps/api/supabase/migrations/007_alerts_description.sql`
- `apps/api/supabase/migrations/008_device_auth_and_pairing_claim.sql`

### Railway (backend)

- **Build (recomendado)**: `pnpm run build:api` (compila dominio + API antes del arranque; arranque más rápido).
- **Start**: `pnpm start` (raíz) o `pnpm --filter @kipi/api start`. Si **no** hubo paso de build y falta `dist/server.js`, el script `apps/api/scripts/start.mjs` intentará compilar automáticamente.
- **Variables de entorno mínimas**:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NODE_ENV=production`
  - `PORT` (Railway lo provee; el server lo lee de env)
- **Validación rápida post-deploy**:
  - `GET /health` debe responder `ok: true` y `supabase.configured: true`

### CORS / URLs

- **Android**: normalmente no depende de CORS (no corre en navegador), pero sí requiere HTTPS en prod.
- **PWA**: si el frontend llama al backend desde otro dominio, asegúrate de permitir ese `Origin`.

## Endpoints

### Healthcheck

#### `GET /health`

- **Auth**: no
- **Uso**: verificar que la API está arriba y si Supabase está configurado.

**Ejemplo**

```bash
curl "http://localhost:8788/health"
```

---

### Dashboard (menores + alertas recientes)

#### `GET /api/dashboard?parent_id={PARENT_UUID}`

- **Auth**: sí (`Authorization: Bearer ...`)
- **Query**
  - `parent_id` (UUID, requerido): debe ser el mismo que `auth.user.id`
- **Respuesta (200)**
  - `{ ok: true, minors: [...] }`
  - Cada menor incluye:
    - `minor_id`, `name`, `age_mode`, `shared_alert_levels`
    - `stats`: conteo de alertas nivel 2 y 3
    - `alertas_recientes`: lista de alertas escaladas al padre

**Ejemplo (curl)**

```bash
curl "http://localhost:8788/api/dashboard?parent_id=UUID_DEL_PADRE" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

**Ejemplo (`fetch`)**

```js
const res = await fetch(`${BASE_URL}/api/dashboard?parent_id=${parentId}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const data = await res.json();
```

---

### Tiempo de pantalla (hoy + semana)

#### `GET /api/screen-time?minor_id={MINOR_UUID}`

- **Auth**: sí (y el menor debe pertenecer al padre autenticado)
- **Query**
  - `minor_id` (UUID, requerido)
- **Respuesta (200)**
  - `{ ok: true, today: { total_minutes, by_category }, weekly }`
  - `by_category` contiene `name`, `hours`, `key` (por ejemplo: `games`, `social`, `videos`, `education`, `communication`, `other`)

**Ejemplo**

```bash
curl "http://localhost:8788/api/screen-time?minor_id=UUID_DEL_MENOR" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

### Apps recientes (eventos)

#### `GET /api/apps/recent?minor_id={MINOR_UUID}`

- **Auth**: sí (y el menor debe pertenecer al padre autenticado)
- **Query**
  - `minor_id` (UUID, requerido)
- **Respuesta (200)**
  - `{ ok: true, apps: [...] }`
  - Cada item incluye `name`, `event_type`, `category`, `risk_level`, `created_at`

**Ejemplo**

```bash
curl "http://localhost:8788/api/apps/recent?minor_id=UUID_DEL_MENOR" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

### Dispositivos vinculados

#### `GET /api/devices?minor_id={MINOR_UUID}`

- **Auth**: sí (y el menor debe pertenecer al padre autenticado)
- **Query**
  - `minor_id` (UUID, requerido)
- **Respuesta (200)**
  - `{ ok: true, devices: [...] }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/devices?minor_id=UUID_DEL_MENOR" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

### Estadísticas de “IA” (conteos agregados)

#### `GET /api/ai/stats?parent_id={PARENT_UUID}`

- **Auth**: sí (el `parent_id` debe ser el usuario autenticado)
- **Query**
  - `parent_id` (UUID, requerido)
- **Respuesta (200)**
  - `{ ok: true, stats: { messages_analyzed, threats_detected, privacy_breaches, last_audit, data_retention_days, processing_local } }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/ai/stats?parent_id=UUID_DEL_PADRE" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

### Crear alerta manual (ayuda)

#### `POST /api/alerts/manual`

- **Auth**: sí
- **Body (JSON)**:
  - `minor_id` (UUID, requerido)
  - `app_source` (string, opcional; default `"Manual"`)
  - `risk_level` (number 1|2|3, opcional; default `2`)
- **Respuesta (200)**
  - `{ ok: true, alert_id, message }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/alerts/manual" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"minor_id\":\"UUID_DEL_MENOR\",\"app_source\":\"WhatsApp\",\"risk_level\":3}"
```

---

### Actualizar acuerdos (niveles compartidos) del menor

#### `PATCH /api/minors/agreement`

- **Auth**: sí
- **Body (JSON)**:
  - `minor_id` (UUID, requerido)
  - `shared_alert_levels` (array de int, opcional; si viene vacío se normaliza a `[1,2,3]`)
- **Respuesta (200)**
  - `{ ok: true, message }`

**Ejemplo**

```bash
curl -X PATCH "http://localhost:8788/api/minors/agreement" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"minor_id\":\"UUID_DEL_MENOR\",\"shared_alert_levels\":[2,3]}"
```

---

## Pairing (emparejamiento de dispositivo)

### Generar código OTP

#### `POST /api/pairing/generate-code`

- **Auth**: no (pensado para el dispositivo/flujo de emparejamiento)
- **Body (JSON)**:
  - `device_model` (string, opcional)
  - `fcm_push_token` (string, opcional)
- **Respuesta (200)**
  - `{ ok: true, session_id, otp, expires_at }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/pairing/generate-code" ^
  -H "Content-Type: application/json" ^
  -d "{\"device_model\":\"Pixel 8\",\"fcm_push_token\":\"TOKEN\"}"
```

### Confirmar código OTP (crea un menor)

#### `POST /api/pairing/confirm-code`

- **Auth**: sí (padre autenticado)
- **Body (JSON)**:
  - `parent_id` (UUID, requerido; debe coincidir con el usuario autenticado)
  - `otp` (string, requerido): 6 caracteres (`A-Z` y `2-9`, sin `I`, `O`, `0`, `1`)
- **Respuesta (200)**
  - `{ ok: true, minor_id, device_id, message }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/pairing/confirm-code" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"parent_id\":\"UUID_DEL_PADRE\",\"otp\":\"ABC234\"}"
```

---

### Reclamar emparejamiento (dispositivo obtiene su `api_key`)

#### `POST /api/pairing/claim`

- **Auth**: no (pero requiere **`session_id` + `otp`**)
- **Body (JSON)**:
  - `session_id` (UUID, requerido): el que regresó `generate-code` (solo lo conoce el dispositivo)
  - `otp` (string, requerido): el código que ve el padre
- **Respuesta (200)**
  - `{ ok: true, device_id, minor_id, api_key }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/pairing/claim" ^
  -H "Content-Type: application/json" ^
  -d "{\"session_id\":\"UUID_DE_SESSION\",\"otp\":\"ABC234\"}"
```

> Guarda `api_key` en el Keystore/EncryptedSharedPreferences. Es el secreto con el que el dispositivo se autentica en `/api/device/*`.

### Analizar “notificación” (guarda alerta)

#### `POST /api/notifications/analyze`

- **Auth**: sí (y el menor debe pertenecer al padre autenticado)
- **Body (JSON)**:
  - `minor_id` (UUID, requerido)
  - `text_preview` (string, requerido; mínimo 3 chars)
  - `app_source` (string, opcional; default `"Sistema"`)
  - `risk_level` (number 1|2|3, opcional): **resultado on-device** (SLM/heurística). Si no viene, usa `mock_risk_level`.
  - `mock_risk_level` (number 1|2|3, opcional): solo para pruebas.
  - `confidence_score` (number, opcional): **confianza on-device** (\(0..1\)).
  - `sensitive_data_flag` (boolean, opcional): si se detectó exposición de datos sensibles (teléfono, dirección, ubicación, etc).
  - `kipi_response` (string, opcional): mensaje on-device para el menor (si el escudo local ya lo generó).
  - `force_cloud` (boolean, opcional): fuerza reclasificación en servidor.
  - `cloud_confidence_threshold` (number, opcional): umbral \(0..1\) para decidir escalamiento a nube (default `0.78`).
  - `shared_alert_levels` (array de int, opcional; default `[1,2,3]`): fallback; si el menor tiene `minors.shared_alert_levels` en BD, ese valor tiene prioridad.
- **Respuesta (200)**
  - `{ ok: true, analysis: {...}, system_action: {...}, cloud: {...}, alert_id, procesado_en_ms }`

**Regla de “IA potente” (escalamiento a nube)**

El backend replica el patrón: **clasificación local primero**, y solo si hay **incertidumbre** se envía a un modelo más potente (Gemini) en servidor.

- Se usa nube si:
  - `force_cloud=true`, o
  - `risk_level >= 2` **y** `confidence_score < cloud_confidence_threshold`, o
  - faltan campos on-device (fallback a nube).
- Si la nube falla, el backend **no bloquea** el flujo: devuelve el análisis on-device y añade `cloud.error`.

**Ejemplo**

```bash
curl "http://localhost:8788/api/notifications/analyze" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"minor_id\":\"UUID_DEL_MENOR\",\"text_preview\":\"Me puedes pasar tu dirección?\",\"app_source\":\"WhatsApp\",\"risk_level\":2,\"confidence_score\":0.55,\"sensitive_data_flag\":true}"
```

---

## Gamificación

### Racha de días seguros

#### `GET /api/gamification/streak?parent_id={PARENT_UUID}`

- **Auth**: sí (el `parent_id` debe ser el usuario autenticado)
- **Respuesta (200)**
  - `{ ok: true, parent_id, safe_days_streak }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/gamification/streak?parent_id=UUID_DEL_PADRE" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Catálogo de misiones + progreso

#### `GET /api/gamification/missions?parent_id={PARENT_UUID}`

- **Auth**: sí (el `parent_id` debe ser el usuario autenticado)
- **Respuesta (200)**
  - `{ ok: true, parent_id, missions, missions_completed_count }`
  - Cada misión incluye `id`, `title`, `description`, `estimated_minutes`, `category`, `is_completed`

**Ejemplo**

```bash
curl "http://localhost:8788/api/gamification/missions?parent_id=UUID_DEL_PADRE" ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Completar una misión

#### `POST /api/gamification/missions/complete`

- **Auth**: sí (padre autenticado)
- **Body (JSON)**:
  - `parent_id` (UUID, requerido; debe coincidir con el usuario autenticado)
  - `mission_id` (string, requerido; debe existir en el catálogo)
- **Respuesta (200)**
  - `{ ok: true, mission_id, missions_completed_count, already_completed }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/gamification/missions/complete" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"parent_id\":\"UUID_DEL_PADRE\",\"mission_id\":\"dif-grooming-guia-2024\"}"
```

---

## Asistente (chat demo)

#### `POST /api/assistant/chat`

- **Auth**: sí
- **Body (JSON)**:
  - `message` (string, opcional)
- **Respuesta (200)**
  - `{ ok: true, reply }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/assistant/chat" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"¿Qué puedo hacer si mi hijo recibe mensajes raros?\"}"
```

---

## Endpoints para App Android (ingesta de datos)

Estos endpoints son para que el **dispositivo** envíe datos al backend. Se autentican con:

- `Authorization: Device <api_key>`

### Identidad del dispositivo (debug)

#### `GET /api/device/me`

- **Auth**: sí (Device)
- **Respuesta**: `{ ok: true, device_id, minor_id }`

### Heartbeat (estado / batería / protección)

#### `POST /api/device/heartbeat`

- **Auth**: sí (Device)
- **Body (JSON)** (opcionales):
  - `battery` (number 0–100)
  - `status` (`"online"` | `"offline"`)
  - `protection_active` (boolean)
- **Respuesta**: `{ ok: true }`

### Enviar alerta (IA del dispositivo → dashboard)

#### `POST /api/device/alerts`

- **Auth**: sí (Device)
- **Body (JSON)**:
  - `app_source` (string, opcional; default `"Android"`)
  - `risk_level` (1|2|3, requerido)
  - `confidence_score` (0–1, opcional; default `0.8`)
  - `sensitive_data_flag` (boolean, opcional)
  - `description` (string, opcional; recomendado)
- **Respuesta (200)**:
  - `{ ok: true, alert_id, system_action: { escalated_to_parent, reason } }`

**Ejemplo**

```bash
curl "http://localhost:8788/api/device/alerts" ^
  -H "Authorization: Device API_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"app_source\":\"WhatsApp\",\"risk_level\":3,\"confidence_score\":0.91,\"sensitive_data_flag\":true,\"description\":\"Solicita dirección y foto\"}"
```

### Enviar tiempo de pantalla (batch diario)

#### `POST /api/device/screen-time/batch`

- **Auth**: sí (Device)
- **Body (JSON)**:
  - `rows` (array, requerido):
    - `app_name` (string)
    - `category` (string)
    - `minutes` (number)
    - `log_date` (YYYY-MM-DD)
- **Respuesta**: `{ ok: true, inserted }`

### Enviar eventos de apps (batch)

#### `POST /api/device/app-events/batch`

- **Auth**: sí (Device)
- **Body (JSON)**:
  - `events` (array, requerido):
    - `app_name` (string)
    - `event_type` (`installed`|`updated`|`uninstalled`)
    - `category` (string)
    - `risk_level` (`low`|`medium`|`high`)
    - `created_at` (ISO8601, opcional)
- **Respuesta**: `{ ok: true, inserted }`

---

## Flujo recomendado (Android ↔ Backend ↔ PWA)

1) **Android** llama `POST /api/pairing/generate-code` → recibe `session_id` + `otp`  
2) **Padre (PWA)** confirma con `POST /api/pairing/confirm-code` (JWT Supabase) → se crea `minor` + `device`  
3) **Android** reclama con `POST /api/pairing/claim` (session_id + otp) → recibe `api_key`  
4) **Android** usa `Authorization: Device <api_key>` para:
   - mandar alertas (`/api/device/alerts`)
   - mandar métricas (`/api/device/screen-time/batch`, `/api/device/app-events/batch`)
   - mandar heartbeat (`/api/device/heartbeat`)
5) **PWA** solo lee dashboard desde Supabase vía backend (`GET /api/dashboard`, etc.)

