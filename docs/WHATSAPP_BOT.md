# EL POLLÓN BOT — Documentación

Bot de WhatsApp **sin IA generativa**. Cerebro: **Supabase**. Costo extra de APIs: **$0**.

Documentos relacionados:

- Diagnóstico: `docs/WHATSAPP_BOT_FASE0_DIAGNOSTICO.md`
- Plan por fases: `docs/WHATSAPP_BOT_IMPLEMENTATION_PLAN.md`

---

## Principio

```
WhatsApp → WhatsAppProvider (Evolution OSS, $0)
        → webhook / Edge o /api
        → BotEngine (reglas + PostgreSQL)
        → Cerebro 1: productos, pedidos, sucursales, delivery
        → Cerebro 2: memoria entrenable (bot_knowledge)
        → plantillas
        → WhatsApp
```

**Prohibido:** OpenAI, Gemini, Groq, Claude, embeddings de pago, Meta Cloud API, Twilio, WATI, 360dialog.

**Búsqueda “inteligente”:** `pg_trgm` + full-text (`tsvector`) + sinónimos + intenciones + umbral de confianza.

**Autoentrenamiento:** pregunta desconocida → panel → admin escribe respuesta → GUARDAR Y ENTRENAR → memoria. Sin LLM.

---

## Tracking

Reutilizar **`pedidos.codigo_pedido`** (ej. `001548`, UI `#001548`).  
URL cliente: `/cuenta/seguimiento/{id}`.  
No crear otro código tipo `EP-1548` en base de datos.

---

## Estados reales (no inventar)

`pendiente` → `aceptado` → `confirmado` → `preparando` → `en_delivery` → `entregado`  
(+ `cancelado`; `listo` solo legacy).

En mensajes, `en_delivery` se muestra como “en camino / en reparto”.

---

## Teléfono

Función única `normalizeChilePhone()` → `+569XXXXXXXX` para Chile.  
No forzar +56 en números internacionales.  
Internamente comparar también `569XXXXXXXX` (formato actual).

---

## Conector WhatsApp

`WhatsAppProvider` (adapter). Implementación inicial prevista: **Evolution API** (open source).

Requisito: proceso persistente. **No** trycloudflare. **No** Vercel como socket.  
Detalle y costos: FASE 0 diagnóstico + FASE 15 del plan.

---

## Tablas FASE 4 (`supabase/fase4-pollon-bot.sql`)

| Tabla | Uso |
|-------|-----|
| `bot_settings` | Config key/value (saludo, soporte, umbral, plantillas de estados) |
| `bot_synonyms` | Diccionario |
| `bot_intents` | Intenciones + keywords + handler |
| `bot_knowledge` | Memoria entrenable (pregunta/respuesta/variantes/FTS) |
| `bot_documents` | Metadatos de PDF/TXT/DOCX en Storage |
| `bot_knowledge_chunks` | Fragmentos + `tsvector` |
| `bot_conversations` | Contexto CRM |
| `bot_messages` | Historial incoming/outgoing |
| `bot_unanswered_questions` | Cola “sin respuesta” |
| `bot_events` | Idempotencia (`event_key` UNIQUE) |
| `bot_notification_queue` | Reintentos WhatsApp |
| `bot_logs` | Logs (sin secretos) |

Funciones: `bot_normalize_text()`, `normalize_chile_phone()` → `+569…`  
Storage: bucket privado `bot-documents`.  
`bot_ai_usage` (si existe) **no se usa**.

---

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` y tokens WA solo en backend / secrets.
- RLS por `super_admin` / `admin_sucursal`.
- Idempotencia: `bot_events.event_key` UNIQUE.
- Cola: `bot_notification_queue` + reintentos limitados.

Este archivo se irá completando en FASE 21 (tablas finales, env, troubleshooting).
