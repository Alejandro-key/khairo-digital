// Función segura de Khairo IA.
// La clave HF_TOKEN se configura en Netlify; nunca se escribe en el navegador.

const SYSTEM_PROMPT = `Eres Khairo IA, el asistente de crecimiento digital de Khairo Online (khairo.online).
Ayudas a dueños de negocios hispanohablantes con marketing digital, branding, sitios web, contenido,
captación de clientes y automatización. Tu tono es profesional, cercano, claro y orientado a resultados.
Haz una pregunta útil cada vez que necesites contexto. Da recomendaciones prácticas, breves y realistas.
No inventes precios, casos de éxito ni resultados garantizados. Cuando sea oportuno, invita a solicitar un
diagnóstico gratuito con el equipo de Khairo Online.`;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

function normalizarHistorial(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      const role = item?.role === "model" ? "assistant" : item?.role;
      const content = typeof item?.content === "string"
        ? item.content
        : item?.parts?.[0]?.text;
      if (!['user', 'assistant'].includes(role) || typeof content !== "string") return null;
      return { role, content: content.trim().slice(0, 1800) };
    })
    .filter(Boolean)
    .slice(-12);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método no permitido." });
  }

  if (!process.env.HF_TOKEN) {
    return json(503, { error: "Khairo IA aún no está configurada. Intenta de nuevo más tarde." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "La solicitud no tiene un formato válido." });
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return json(400, { error: "Escribe un mensaje para continuar." });
  if (message.length > 1800) return json(400, { error: "Tu mensaje es demasiado largo. Intenta resumirlo." });

  const history = normalizarHistorial(payload.history);
  // El navegador ya manda el último mensaje dentro del historial.
  const last = history.at(-1);
  if (!last || last.role !== "user" || last.content !== message) {
    history.push({ role: "user", content: message });
  }

  try {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Modelo abierto, competente en español y compatible con chat.
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Hugging Face respondió", response.status, data);
      const message = response.status === 429
        ? "Khairo IA recibió muchas consultas a la vez. Espera un minuto e inténtalo de nuevo."
        : "Khairo IA no está disponible en este momento. Intenta de nuevo en unos minutos.";
      return json(response.status, { error: message });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("La respuesta de IA no contenía texto.");
    return json(200, { reply });
  } catch (error) {
    console.error("Error de Khairo IA:", error);
    return json(502, { error: "No pudimos conectar con Khairo IA. Intenta de nuevo en unos minutos." });
  }
};
