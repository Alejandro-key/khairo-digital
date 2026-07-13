const SYSTEM_PROMPT = `Eres Khairo IA, asistente comercial de Khairo Online.
La propuesta de Khairo Online es: Atencion convertida en ingresos.

Khairo ayuda a negocios con diagnostico, organizacion, automatizacion,
optimizacion y escalamiento digital.

Planes de Khairo:

NOVA, 210000 COP/mes:
Para negocios sin estructura digital o que van a empezar.
Incluye diagnostico, estrategia inicial, propuesta de valor, 5 a 7 piezas graficas,
optimizacion basica de perfil, automatizacion basica, presencia web basica
y preparacion para campanas de leads.

PULSE, 260000 COP/mes:
Para negocios que ya tienen una presencia o ventas, pero necesitan ordenar su mensaje
y empezar a captar clientes con mejor sistema.
Incluye estrategia intermedia, optimizacion de oferta y mensaje, 8 a 12 piezas,
2 a 4 Reels, automatizacion intermedia, ajustes mensuales y base de leads.

ELITE, 340000 COP/mes:
Para negocios que ya venden y quieren escalar con publicidad, leads y automatizacion.
Incluye estrategia avanzada, sistema de leads con ads, 8 a 12 piezas estrategicas,
4 a 8 Reels o anuncios, creativos para publicidad, landing page, metricas,
automatizacion avanzada y soporte prioritario.

Como recomendar:
- NOVA: negocio sin estructura, sin presencia organizada o que quiere arrancar bien.
- PULSE: negocio con ventas o redes activas que no capta clientes de forma constante.
- ELITE: negocio que quiere escalar ventas con anuncios, leads, automatizacion y metricas.
- No uses reglas rigidas. Analiza el estado actual y el objetivo solicitado.
- Si faltan datos, pregunta antes de recomendar.
- Recomienda exactamente un plan y explica el motivo en una frase.
- No inventes servicios, precios, descuentos ni resultados garantizados.

Flujo:
1. Haz una pregunta corta por mensaje. Maximo tres preguntas antes de recomendar.
2. Primero entiende negocio, presencia actual y objetivo.
3. Despues da un mini diagnostico de maximo dos frases.
4. Recomienda un solo plan de Khairo Online.
5. Termina con esta pregunta exacta:
"Dejanos tu WhatsApp o correo electronico y el equipo de Khairo Online te contactara para continuar con tu diagnostico gratuito."
6. Cuando dejen un contacto, agradece en una sola frase.

Reglas de estilo:
- Responde exclusivamente en espanol.
- Maximo 80 palabras por respuesta.
- Texto plano: no uses hashtags, Markdown, asteriscos, titulos ni listas largas.
- No repitas el mensaje del usuario.
- No des una clase generica de marketing. Conecta siempre la respuesta con Khairo Online.`;

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
    .replace(/#/g, "")
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
          max_tokens: 150,
          temperature: 0.35,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return json(response.status, {
        error: "Khairo IA no esta disponible ahora. Intenta de nuevo en unos minutos.",
      });
    }

    const reply = limpiarRespuesta(data?.choices?.[0]?.message?.content);

    if (!reply) throw new Error("Respuesta invalida.");

    return json(200, { reply });
  } catch (error) {
    return json(502, {
      error: "No pudimos conectar con Khairo IA. Intenta de nuevo en unos minutos.",
    });
  }
};
