/**
 * API serverless (Vercel) — Pollito Bot × OpenAI
 * La clave OPENAI_API_KEY NUNCA va al frontend; solo en variables de Vercel.
 */

const POLLITO_SYSTEM = `Actúa como el asistente virtual oficial de Pollería El Pollón. Tu nombre es "Pollito Bot".

Eres un pollito robot amigable, inteligente, profesional y experto en atención al cliente. Ayudas con sucursales, productos, promociones, delivery, reservas, horarios, ubicaciones y pedidos.

PERSONALIDAD: amable, profesional pero cercana, respuestas claras, emojis moderados, nunca frío, siempre positivo, español de Chile.

REGLA OBLIGATORIA: Antes de dar datos específicos de productos, precios, delivery o horarios, confirma la sucursal. Si el cliente no la indicó, pídela amablemente.

REGLAS CRÍTICAS:
- NUNCA inventes precios, promociones, horarios ni direcciones.
- Usa SOLO la información del bloque "DATOS VERIFICADOS" que recibes abajo.
- Si falta un dato, di que un colaborador puede ayudar por WhatsApp.
- Respuestas breves (máximo 3 párrafos cortos).
- Si la pregunta no es sobre El Pollón, redirige amablemente.
- Para pedidos, reclamos o casos complejos, recomienda WhatsApp.

CONVERSIÓN: Si hay intención de compra, invita a ver la carta en /tienda o a pedir por WhatsApp.

IDENTIDAD: Representas a POLLERÍA EL POLLÓN (https://el-pollon.cl).`;

function buildVerifiedBlock(branchContext, menuContext, siteContext) {
  const parts = ['--- DATOS VERIFICADOS (usa solo esto) ---'];

  if (siteContext) {
    parts.push(`Sitio: ${siteContext.siteUrl || 'https://el-pollon.cl'}`);
    parts.push(`Pagos: ${siteContext.payments || 'Efectivo al recibir o transferencia bancaria. No hay pago con tarjeta en la web.'}`);
    parts.push(`Delivery costo orientativo: ${siteContext.deliveryRange || 'Consultar según sucursal'}`);
  }

  if (branchContext) {
    parts.push(`SUCURSAL SELECCIONADA: ${branchContext.name}`);
    parts.push(`Ciudad: ${branchContext.city || '—'}`);
    parts.push(`Dirección: ${branchContext.address || '—'}`);
    parts.push(`Horario: ${branchContext.schedule || '—'}`);
    parts.push(`Teléfono: ${branchContext.phone || '—'}`);
    parts.push(`WhatsApp: ${branchContext.whatsapp || '—'}`);
    parts.push(`Zona delivery: ${branchContext.deliveryZones || '—'}`);
    parts.push(`Tiempo estimado delivery: ${branchContext.deliveryEta || '—'}`);
    parts.push(`Costo delivery referencial: ${branchContext.deliveryCost != null ? `$${Number(branchContext.deliveryCost).toLocaleString('es-CL')}` : 'Consultar en checkout'}`);
    parts.push(`Delivery activo: ${branchContext.deliveryEnabled !== false ? 'Sí' : 'No'}`);
    parts.push(`Retiro en local: ${branchContext.pickupEnabled !== false ? 'Sí' : 'No'}`);
  } else {
    parts.push('SUCURSAL: aún no seleccionada — solicítala antes de datos específicos.');
    if (siteContext?.branches?.length) {
      parts.push('Sucursales disponibles:');
      siteContext.branches.forEach((b) => {
        parts.push(`- ${b.name} (${b.city}): ${b.address}`);
      });
    }
  }

  if (menuContext?.length) {
    parts.push('CARTA (precios en CLP):');
    menuContext.forEach((cat) => {
      parts.push(`[${cat.categoria}]`);
      (cat.productos || []).forEach((p) => {
        parts.push(`  • ${p.nombre}: $${Number(p.precio).toLocaleString('es-CL')}${p.descripcion ? ` — ${p.descripcion}` : ''}`);
      });
    });
  } else if (branchContext) {
    parts.push('CARTA: no cargada en este momento. Indica al cliente que vea https://el-pollon.cl/tienda');
  }

  parts.push('--- FIN DATOS VERIFICADOS ---');
  return parts.join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Pollito Bot no está configurado. Agrega OPENAI_API_KEY en Vercel.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { messages, branchContext, menuContext, siteContext } = body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Mensajes inválidos' });
    }

    const sanitized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const systemContent = `${POLLITO_SYSTEM}\n\n${buildVerifiedBlock(branchContext, menuContext, siteContext)}`;

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 550,
        messages: [{ role: 'system', content: systemContent }, ...sanitized],
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('[Pollito Bot]', data);
      return res.status(openaiRes.status).json({
        error: data.error?.message || 'Error al consultar OpenAI',
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ error: 'Respuesta vacía del asistente' });
    }

    const lower = reply.toLowerCase();
    const suggestWhatsApp = /whatsapp|pedido|reclamo|colaborador|atención personalizada/.test(lower);

    return res.status(200).json({ reply, suggestWhatsApp });
  } catch (err) {
    console.error('[Pollito Bot]', err);
    return res.status(500).json({ error: 'Error interno del asistente' });
  }
}
