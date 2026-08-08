# EL POLLÓN BOT — Plan de implementación

Sistema nuevo **sobre** el proyecto actual. Sin IA. Sin APIs de pago nuevas.  
Seguimiento de fases del Prompt Maestro Definitivo.

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecha

---

## FASE 0 — Backup / diagnóstico

- [x] Inventario WhatsApp anterior (congelar, no borrar)
- [x] Documentar Evolution vs Meta vs túneles
- [x] SQL solo lectura `supabase/fase0-bot-diagnostico.sql`
- [x] Doc `docs/WHATSAPP_BOT_FASE0_DIAGNOSTICO.md`
- [ ] Usuario: backup/snapshot Supabase (recomendado antes de FASE 4)

---

## FASE 1 — Análisis completo

- [x] Auditoría 20 puntos (este repo + respuesta en chat)
- [x] `docs/WHATSAPP_BOT.md` inicial

---

## FASE 2 — Mapeo tablas actuales

- [x] Pedidos, detalle, clientes, productos, sucursales, WA viejo, `bot_*` parciales
- [ ] Confirmar en vivo con `fase0-bot-diagnostico.sql` (si el usuario lo ejecuta)

---

## FASE 3 — Diseño arquitectura

- [x] Dos cerebros + BotEngine + Provider + cola + entrenamiento manual
- [x] Diseño en sección “Diseño recomendado” más abajo

---

## FASE 4 — Migraciones (primera fase de código SQL)

- [x] `pg_trgm` + `unaccent`
- [x] Tablas `bot_*` (CREATE IF NOT EXISTS / ALTER si ya existían)
- [x] RLS + índices GIN / trgm
- [x] Bucket Storage `bot-documents` (privado)
- [x] **No DROP** de `ep_wa_*` ni de tienda
- [x] No crear `bot_ai_usage`; se ignora si existe
- [ ] Usuario: ejecutar `supabase/fase4-pollon-bot.sql` en SQL Editor

---

## FASE 5 — BotEngine

- [ ] `lib/bot/engine.js` — pipeline determinista
- [ ] Sin imports a Ollama / OpenAI / Gemini

---

## FASE 6 — Teléfono

- [ ] `normalizeChilePhone()` → `+569…` + match dual con `569…`

---

## FASE 7 — Intenciones

- [ ] Tabla `bot_intents` + seed + detector por keywords/patrones

---

## FASE 8 — Búsqueda PostgreSQL

- [ ] FTS + `similarity()` + funciones SQL `bot_search_knowledge`

---

## FASE 9 — Memoria

- [ ] CRUD `bot_knowledge` + variantes + keywords

---

## FASE 10 — Documentos

- [ ] Upload Storage + parser OSS (pdf/txt/docx) + chunks
- [ ] Si un formato exige API de pago → no usarlo

---

## FASE 11 — Preguntas sin respuesta

- [ ] `bot_unanswered_questions` + deduplicación por similitud

---

## FASE 12 — Guardar y entrenar

- [ ] De unanswered → knowledge, activo al instante (sin redeploy)

---

## FASE 13 — Pedidos nuevos

- [ ] Database Webhook / trigger → cola (no el frontend)
- [ ] Mensaje con ítems reales + `codigo_pedido`

---

## FASE 14 — Estados

- [ ] Mapa estados reales → plantillas editables + idempotencia

---

## FASE 15 — WhatsAppProvider

- [ ] Interface + Evolution adapter
- [ ] Documentar host persistente $0 (Oracle Always Free u otro)
- [ ] **No** trycloudflare producción · **No** Meta Cloud API

---

## FASE 16 — Conversaciones CRM (Realtime)

- [ ] `bot_conversations` + `bot_messages` + contexto

---

## FASE 17 — Panel

- [ ] Renombrar nav a **WhatsApp Bot** (mismo perm `whatsapp_ai`)
- [ ] Subrutas: dashboard, inbox, memoria, sin respuesta, documentos, sinónimos, intenciones, config, eventos, logs, conexión

---

## FASE 18 — Configuración

- [ ] `bot_settings` key/value en Supabase (nada hardcodeado crítico)

---

## FASE 19 — Seguridad

- [ ] RLS, secrets solo backend, rate limit, auditoría

---

## FASE 20 — Testing

- [ ] Casos: hola, precio, delivery, pedido, estados, duplicado webhook, humano, desconocido → entrenar → similar responde
- [ ] `npm run build`

---

## FASE 21 — Producción

- [ ] Completar `docs/WHATSAPP_BOT.md`
- [ ] `.env.example` sin secretos
- [ ] Deploy Vercel + SQL + (si hay) Evolution en host estable

---

## Diseño recomendado (FASE 3)

### Qué reutilizar

- `branches`, `products`, `categories`, `promotions`, `delivery_zones`, `ep_quote_delivery`
- `pedidos` + `detalle_pedidos` + `datos_json` (ítems, deliveryFee, wa_avisos)
- `profiles.phone`, `customer_marketing_preferences`
- `codigo_pedido` = tracking
- Permiso `whatsapp_ai`, ruta `/admin/whatsapp`
- `AdminLayout`, `AdminPageHeader`, `AdminTable`, colores Pollón
- `orderService` / `menuService` / `branchService` (consulta, no envío WA desde el browser)
- `lib/whatsapp/text.js` (CLP) y lógica de intents **como inspiración**, no como dependencia de Evolution/Ollama

### Qué crear (namespace `bot_`)

| Tabla | Rol |
|-------|-----|
| `bot_settings` | Config editable |
| `bot_synonyms` | Diccionario |
| `bot_intents` | Intenciones + keywords |
| `bot_knowledge` | Memoria entrenable |
| `bot_knowledge_chunks` | Fragmentos documentos |
| `bot_conversations` | Contexto CRM |
| `bot_messages` | Historial |
| `bot_unanswered_questions` | Cola de entrenamiento |
| `bot_events` | Idempotencia |
| `bot_notification_queue` | Reintentos WA |
| `bot_logs` | Logs sin secretos |
| `bot_documents` | Metadatos archivos Storage |

Si `bot_knowledge` / `bot_events` / `bot_logs` ya existen por `fase2-pollon-ia.sql`: **ALTER** columnas faltantes.

### Flujo pedido (sin depender del admin con el navegador abierto)

```
INSERT/UPDATE pedidos
  → trigger o Database Webhook
  → Edge Function o /api bot-notify (service_role)
  → bot_events (UNIQUE event_key)
  → bot_notification_queue
  → WhatsAppProvider.sendText()
```

### Jerarquía de respuesta

1. Datos dinámicos (precio, horario, pedido, delivery)  
2. Reglas / intenciones  
3. Memoria FAQ  
4. Chunks de documentos  
5. Fallback + guardar unanswered  

Umbral confianza configurable (`minimum_confidence`, default ~0.80).

### Guía de compra (flujo REAL de la web)

1. Entrar a https://www.el-pollon.cl/  
2. Elegir sucursal (`/sucursal`)  
3. Armar carrito en tienda (`/tienda`)  
4. Checkout: nombre, teléfono, dirección si delivery, tipo (delivery / retiro / reserva), pago **efectivo o transferencia al recibir** (no Webpay en la web)  
5. Confirmar → código **`#codigo_pedido`**  
6. Seguimiento: cuenta `/cuenta/seguimiento/{id}` o con el código en el local/WhatsApp  

Plantilla editable; no inventar pasos extra.

### Costos (obligatorio revisar antes de cualquier plataforma nueva)

| Nombre | Para qué | Costo | ¿Obligatorio? | Alternativa $0 |
|--------|----------|-------|---------------|----------------|
| Supabase | Cerebro, DB, Realtime, Storage, Auth | **Ya lo pagas** | Sí | — |
| Vercel + GitHub | Web + panel + `/api` | **Ya lo usas** | Sí | — |
| Evolution API | Conectar WhatsApp no oficial | Licencia **$0** | Para WA real | Simulador en panel hasta tener host |
| VM persistente | Que Evolution no se caiga | Oracle Always Free u otra VM **$0** | Para WA 24/7 | Encender solo en horario (no ideal) |
| Meta Cloud API | WA oficial | Puede cobrar mensajes | **No** | Evolution |
| OpenAI/Gemini/Groq | IA | Pago / límites de pago | **No** | pg_trgm + memoria |
| pdf-parse / mammoth | Extraer PDF/DOCX | OSS **$0** | Solo FASE 10 | TXT si el binario falla |

**Nuevo costo de software del bot: $0.**  
No se añade ninguna de las filas de pago.

---

## Orden de código (a partir de ahora)

1. FASE 4 SQL cuando el usuario confirme backup o pida continuar.  
2. Luego BotEngine (5–8) sin WhatsApp real (se puede probar con simulador).  
3. Panel memoria + unanswered (9–12, 17).  
4. Webhooks pedidos/estados (13–14).  
5. Evolution provider cuando haya host estable (15, 21).
