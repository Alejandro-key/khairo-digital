// Khairo IA: the token is stored only in Netlify as HF_TOKEN.

const SYSTEM_PROMPT = `Eres Khairo IA, el asistente de crecimiento digital de Khairo Online.
Ayudas a duenos de negocios hispanohablantes con marketing digital, branding, sitios web,
contenido, captacion de clientes y automatizacion. Tu tono es profesional, cercano, claro y util.
Da recomendaciones breves y realistas. No inventes precios, casos de exito ni resultados garantizados.
Responde exclusivamente en espanol. Usa texto plano: no Markdown, asteriscos, etiquetas tecnicas ni otros idiomas.
Nunca repitas el mensaje del usuario ni escribas los roles user, assistant, usuario o asistente.`;

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
      const content = typeof item?.content === "string" ? item.content : item?.parts?.[0]?.text;
      if (!['user', 'assistant'].includes(role) || typeof content !== "string") return null;
      return { role, content: content.trim().slice(0, 1800) };
    })
    .filter(Boolean)
    .slice(-12);
}

function limpiarRespuesta(text) {
  let clean = String(text || "").replace(/\*\*/g, "").replace(/`/g, "").trim();
  const cortes = [
    clean.search(/[\u3400-\u9FFF\uF900-\uFAFF]/u),
    clean.search(/\n\s*(?:user|usuario|assistant|asistente|system|sistema)\s*:?/i),
    clean.search(/\b(?:user|usuario)\s+(?:tengo|soy|mi|quiero|hola|necesito)\b/i),
  ].filter((posicion) => posicion >= 0);
  if (cortes.length) clean = clean.slice(0, Math.min(...cortes));
  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Metodo no permitido." });
  if (!process.env.HF_TOKEN) return json(503, { error: "Khairo IA aun no esta configurada." });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "La solicitud no tiene un formato valido." });
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return json(400, { error: "Escribe un mensaje para continuar." });
  if (message.length > 1800) return json(400, { error: "Tu mensaje es demasiado largo." });

  const history = normalizarHistorial(payload.history);
  const last = history.at(-1);
  if (!last || last.role !== "user" || last.content !== message) history.push({ role: "user", content: message });

  try {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        max_tokens: 300,
        temperature: 0.45,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Hugging Face", response.status, data);
      const error = response.status === 429
        ? "Khairo IA recibio muchas consultas. Espera un minuto e intentalo de nuevo."
        : "Khairo IA no esta disponible ahora. Intenta de nuevo en unos minutos.";
      return json(response.status, { error });
    }

    const reply = limpiarRespuesta(data?.choices?.[0]?.message?.content);
    if (!reply) throw new Error("La respuesta no contenia texto valido.");
    return json(200, { reply });
  } catch (error) {
    console.error("Error de Khairo IA:", error);
    return json(502, { error: "No pudimos conectar con Khairo IA. Intenta de nuevo en unos minutos." });
  }
};
