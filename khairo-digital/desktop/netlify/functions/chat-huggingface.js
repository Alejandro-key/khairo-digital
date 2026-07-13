const SYSTEM_PROMPT = `Eres Khairo IA, el asistente comercial y estrategico de Khairo Online.

Khairo Online es una agencia de crecimiento digital. Su propuesta es: "Atencion convertida en ingresos".
Ayuda a negocios a crecer mediante diagnostico, organizacion, automatizacion, optimizacion y escalamiento.

Khairo Online trabaja con presencia digital, branding, sitios web, contenido para redes sociales,
captacion de clientes, publicidad digital, automatizaciones y mejora de procesos comerciales.

La agencia cuenta con las soluciones NOVA, PULSE y ELITE. No inventes lo que incluye cada plan,
precios, descuentos ni resultados garantizados. Si preguntan por precios o planes, explica que
la recomendacion depende del diagnostico del negocio e invitalos a solicitar un diagnostico gratuito.

Tu objetivo no es dar una clase larga de marketing. Tu objetivo es entender el negocio, detectar
su reto principal y mostrar como Khairo Online puede ayudar.

Forma de conversar:
1. Primero identifica: tipo de negocio, ciudad o mercado, objetivo, clientes actuales y principal reto.
2. Haz una pregunta por vez cuando falte informacion.
3. Tras obtener contexto, entrega un mini diagnostico: problema detectado, oportunidad y siguiente paso.
4. Relaciona siempre la recomendacion con servicios de Khairo Online.
5. Cierra de forma natural invitando al Diagnostico Gratuito de Khairo IA o a hablar con el equipo.
6. Se directo, cercano y profesional. Responde exclusivamente en espanol.
7. Usa texto plano: sin Markdown, sin asteriscos, sin otros idiomas y sin repetir el mensaje del usuario.

No prometas ventas garantizadas. No inventes informacion de la agencia.`;

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
      const content =
        typeof item?.content === "string" ? item.content : item?.parts?.[0]?.text;

      if (!["user", "assistant"].includes(role) || typeof content !== "string") {
        return null;
      }

      return { role, content: content.trim().slice(0, 1800) };
    })
    .filter(Boolean)
    .slice(-12);
}

function limpiarRespuesta(text) {
  let clean = String(text || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();

  const cortes = [
    clean.search(/[\u3400-\u9FFF\uF900-\uFAFF]/u),
    clean.search(/\n\s*(?:user|usuario|assistant|asistente|system|sistema)\s*:?/i),
    clean.search(/\b(?:user|usuario)\s+(?:tengo|soy|mi|quiero|hola|necesito)\b/i),
  ].filter((posicion) => posicion >= 0);

  if (cortes.length) clean = clean.slice(0, Math.min(...cortes));

  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Metodo no permitido." });
  }

  if (!process.env.HF_TOKEN) {
    return json(503, { error: "Khairo IA aun no esta configurada." });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "La solicitud no tiene un formato valido." });
  }

  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";

  if (!message) {
    return json(400, { error: "Escribe un mensaje para continuar." });
  }

  if (message.length > 1800) {
    return json(400, { error: "Tu mensaje es demasiado largo." });
  }

  const history = normalizarHistorial(payload.history);
  const last = history.at(-1);

  if (!last || last.role !== "user" || last.content !== message) {
    history.push({ role: "user", content: message });
  }

  try {
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
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
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error =
        response.status === 429
          ? "Khairo IA recibio muchas consultas. Espera un minuto e intentalo de nuevo."
          : "Khairo IA no esta disponible ahora. Intenta de nuevo en unos minutos.";

      return json(response.status, { error });
    }

    const reply = limpiarRespuesta(data?.choices?.[0]?.message?.content);

    if (!reply) {
      throw new Error("La respuesta no contenia texto valido.");
    }

    return json(200, { reply });
  } catch (error) {
    console.error("Error de Khairo IA:", error);

    return json(502, {
      error: "No pudimos conectar con Khairo IA. Intenta de nuevo en unos minutos.",
    });
  }
};
