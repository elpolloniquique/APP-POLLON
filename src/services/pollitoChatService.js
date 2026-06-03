/**
 * Cliente del asistente Pollito Bot → API serverless /api/pollito-chat
 */

export async function sendPollitoMessage({ messages, branchContext, menuContext, siteContext }) {
  const res = await fetch('/api/pollito-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, branchContext, menuContext, siteContext }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'No se pudo contactar a Pollito Bot');
  }

  return {
    reply: data.reply,
    suggestWhatsApp: Boolean(data.suggestWhatsApp),
  };
}
