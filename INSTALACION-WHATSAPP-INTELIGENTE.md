# WhatsApp Inteligente El Pollón — instalación (Fase 1)

Concierge + avisos + FAQ + quejas. **No cobra ni arma carrito en el chat.**  
La venta sigue en [https://www.el-pollon.cl/](https://www.el-pollon.cl/).  
**Cero APIs de pago.** Evolution API / Baileys (open source) + Supabase + Vercel.

---

## 1. Qué debes tener claro

| Pieza | Dónde corre | Por qué |
|---|---|---|
| Panel admin `/admin/whatsapp` | Vercel (El Pollón) | Solo **super_admin** |
| Webhooks + motor | `api/wa-*.js` en Vercel | Reciben mensajes y avisos de pedidos |
| Socket de WhatsApp | **Evolution 24/7** (PC del local u Oracle Cloud Always Free) | Vercel **no** puede mantener el QR conectado |

Un bot **por sucursal**. Activas Iquique y dejas OFF Alto Hospicio si quieres.

---

## 2. SQL (obligatorio)

En Supabase → **SQL Editor** → pega y ejecuta:

`el-pollon/supabase/fix-whatsapp-inteligente.sql`

Crea: `ep_wa_settings`, `ep_wa_kb`, `ep_wa_sessions`, `ep_wa_messages`, `ep_wa_outbox`, `ep_wa_alerts`  
RLS: solo `super_admin`.

---

## 3. Variables en Vercel (y `.env.local` para pruebas)

```
EVOLUTION_API_URL=http://TU-SERVIDOR:8080
EVOLUTION_API_KEY=una-clave-larga-que-tu-elijes
EP_WA_WEBHOOK_SECRET=otra-clave-distinta
VITE_PUBLIC_SITE_URL=https://www.el-pollon.cl
SUPABASE_SERVICE_ROLE_KEY=…   (ya debería existir)
```

Nunca pongas `EVOLUTION_API_KEY` ni `SERVICE_ROLE` en el frontend (`VITE_*`).

---

## 4. Instalar Evolution API (gratis, Docker)

En un PC que quede encendido **o** en Oracle Cloud Always Free:

```bash
git clone https://github.com/EvolutionAPI/evolution-api.git
cd evolution-api
```

Crea un `.env` (ejemplo mínimo):

```
AUTHENTICATION_API_KEY=la-misma-que-EVOLUTION_API_KEY-en-Vercel
SERVER_URL=http://IP-PUBLICA:8080
```

Levanta:

```bash
docker compose up -d
```

Abre `http://IP:8080` y confirma que Evolution responde.

Si el PC está detrás de router: reenvía el puerto **8080** (o usa un túnel).  
Oracle Cloud: abre el puerto en Security List + firewall.

---

## 5. Conectar una sucursal

1. Entra a **https://www.el-pollon.cl/admin/whatsapp** con super admin.
2. Elige sucursal (arriba).
3. Pestaña **Conexión** → **Generar / recargar QR**.
4. Escanea con el WhatsApp **del local** (o un teléfono dedicado).
5. Espera badge **Conectado**.
6. Activa el toggle **Activar en esta sucursal**.
7. Pestaña **Configurar**: deja **modo proactivo OFF** (recomendado).
8. Guarda.

Webhook que debe apuntar Evolution (el panel lo intenta configurar solo):

`https://www.el-pollon.cl/api/wa-evolution-webhook?secret=EP_WA_WEBHOOK_SECRET`

Si no quedó automático: en Evolution → instancia `ep_…` → Webhook → esa URL → evento `MESSAGES_UPSERT`.

---

## 6. Cómo probar (criterio de aceptación)

1. Desde otro teléfono escribe **hola** al WhatsApp de esa sucursal.  
   Debe saludar *Pollería El Pollón — {sucursal}* + pasos + link web.
2. **¿Atienden?** → abierto/cerrado real + horario.
3. Nombre de un plato (ej. *chaufa*) → precio real + link `/tienda?branch=…&q=…`.
4. Haz un pedido de prueba en la web → checkout **Activar avisos…** → envía el mensaje.  
   El bot confirma con detalle (si el módulo está ON).
5. En `/admin/pedidos` pasa a **preparando** → aviso cocina.  
   Luego **en_delivery** → en camino.  
   **entregado** → gracias (+ fidelización si ya tiene compras).
6. Escribe **reclamo** / **está frío** → empatía, el bot se calla, alerta en pestaña **Entrenar + Live**. Tú respondes a mano en el mismo WhatsApp.
7. Edita una plantilla o KB → el **siguiente** mensaje ya usa el texto nuevo (sin redeploy).

Simulador (sin WhatsApp): pestaña **Entrenar + Live** → escribe un mensaje de prueba.

---

## 7. Webhook de pedidos en Supabase (opcional, recomendado)

Además del aviso que dispara el panel al cambiar estado, puedes crear un **Database Webhook**:

- Tabla `pedidos` → INSERT + UPDATE  
- URL: `https://www.el-pollon.cl/api/wa-order-notify`  
- Header: `X-EP-WA-SECRET` = el mismo `EP_WA_WEBHOOK_SECRET`

Así también llegan avisos si el estado cambia desde otro sistema.

---

## 8. Modo proactivo vs avisos (importante)

| Modo | Qué hace | Riesgo |
|---|---|---|
| **OFF (default)** | Espera “Activar avisos…” / “AVISOS #codigo” | Bajo — recomendado |
| **ON** | El bot escribe primero cuando nace el pedido | Mayor riesgo de ban de WhatsApp |

No hagas campañas masivas por este canal.

---

## 9. Si algo falla

| Síntoma | Qué revisar |
|---|---|
| QR no sale | `EVOLUTION_API_URL` / `KEY` en Vercel · Evolution arriba · firewall |
| “hola” no responde | Toggle activado · webhook URL+secret · instancia `ep_…` de ESA sucursal |
| No llegan avisos de estado | SQL ejecutado · pedido con teléfono 56 9… · outbox en Live · Evolution conectado |
| Cajera ve el menú | No debe: solo `super_admin` tiene `whatsapp_ai` |

---

## 10. Qué no hace Fase 1 (a propósito)

- Cobrar o armar carrito en WhatsApp  
- LLM de pago (ChatGPT, etc.)  
- Acceso para admin de sucursal / cajera  
- Fotos de plato (flag listo, Fase 2)  
- Métricas avanzadas (Fase 2)
