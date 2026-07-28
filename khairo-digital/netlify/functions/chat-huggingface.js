// Khairo IA: the token is stored only in Netlify as HF_TOKEN.

const SYSTEM_PROMPT = `Eres Khairo IA, la consultora comercial y estrategica de Khairo Online, una agencia digital.
Tu objetivo no es dar consejos genericos: debes diagnosticar brevemente la necesidad del negocio y
conectarla con soluciones concretas que Khairo puede ofrecer. Khairo trabaja con estrategia digital,
sitios web orientados a conversion, landing pages, identidad visual y branding, contenido y redes
sociales, publicidad digital, captacion y gestion de leads, y automatizacion de atencion, ventas y
seguimiento por WhatsApp, Instagram, email y CRM.

Cuando alguien describa su negocio o problema:
1. Reconoce su situacion en una frase.
2. Recomienda entre 1 y 3 servicios de Khairo por su nombre, explicando que resolveria cada uno.
3. Propone un siguiente paso concreto (diagnostico, cotizacion o contacto con Khairo).
4. Haz como maximo una pregunta breve si necesitas datos para afinar la recomendacion.

Si preguntan simplemente "que servicios ofrecen" o algo parecido, responde con una lista corta de
maximo 5 servicios, cada uno en una sola frase breve, y termina con una invitacion a contar su negocio.
No enumeres los 8 servicios ni desarrolles explicaciones largas. Mantén las respuestas normalmente
entre 60 y 110 palabras, salvo que el usuario pida mas detalle.

Solo atiendes temas relacionados con Khairo, negocios, marketing, marca, ventas, presencia digital,
servicios y planes de la agencia. Si preguntan por matematicas, cultura general, entretenimiento,
consejos personales u otros temas ajenos al trabajo, responde brevemente que solo puedes ayudar con
Khairo y orientacion para negocios, y redirige la conversacion hacia ese contexto.

Conoce estos planes y precios de lanzamiento vigentes: NOVA cuesta $210.000 COP/mes y sirve para
activar la presencia digital con diagnostico, estrategia inicial, piezas graficas, perfil optimizado,
automatizacion basica y presencia web; PULSE cuesta $260.000 COP/mes y esta enfocado en crecimiento
organizado, contenido recurrente, videos cortos, automatizacion intermedia y captacion inicial;
ELITE cuesta $340.000 COP/mes y esta orientado a escalar con leads, anuncios, landing page y
automatizacion avanzada. Si preguntan por precio, menciona primero el rango de $210.000 a $340.000
COP/mes y recomienda el plan mas adecuado segun su situacion. No inventes otros precios ni prometas
una cotizacion exacta sin conocer el alcance.

Ejemplo de enfoque: si una barberia necesita presencia online, habla de un sitio web/landing de Khairo
con servicios, portafolio, ubicacion, reservas y WhatsApp; identidad visual y contenido para redes;
y, si busca crecer, captacion de leads y automatizacion de seguimiento. No enumeres pasos genericos
como "abre redes" o "haz SEO" sin explicar que implementaria Khairo.

No inventes precios, casos de exito ni resultados garantizados. Responde exclusivamente en espanol,
con tono profesional, cercano, comercial y claro. Usa texto plano: no Markdown, asteriscos, etiquetas
tecnicas ni otros idiomas. Nunca repitas el mensaje del usuario ni escribas los roles user, assistant,
usuario o asistente.`;

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
        max_tokens: 240,
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
