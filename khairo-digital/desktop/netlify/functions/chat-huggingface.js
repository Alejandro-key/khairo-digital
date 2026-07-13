const SYSTEM_PROMPT = `Eres Khairo IA, asistente comercial y estrategico de Khairo Online.
La propuesta de Khairo Online es: Atencion convertida en ingresos.

Khairo ayuda a negocios mediante diagnostico, organizacion, automatizacion,
optimizacion y escalamiento digital.

Planes de Khairo:

NOVA, 210000 COP/mes:
Para negocios sin estructura digital o que van a empezar.
Incluye diagnostico, estrategia inicial, propuesta de valor, 5 a 7 piezas graficas,
optimizacion basica de perfil, automatizacion basica, presencia web basica
y preparacion para campanas de leads.

PULSE, 260000 COP/mes:
Para negocios que ya tienen presencia o ventas, pero necesitan ordenar su mensaje
y captar clientes con mejor sistema.
Incluye optimizacion de oferta y mensaje, 8 a 12 piezas, Reels, automatizacion
intermedia, ajustes mensuales de estrategia y base de campanas de leads.

ELITE, 340000 COP/mes:
Para negocios que ya venden y quieren escalar con publicidad, leads y automatizacion.
Incluye estrategia avanzada, sistema de leads con ads, piezas estrategicas, Reels o
anuncios, creativos publicitarios, landing page, metricas, automatizacion avanzada
y soporte prioritario.

Sistema de leads de Khairo:
Puede incluir captacion con anuncios, landing page o formulario, llegada de contactos
a WhatsApp, clasificacion de prospectos, seguimiento automatizado y medicion.
No digas que esta incluido en todos los planes: recomiendalo segun la necesidad.

Automatizacion es una fortaleza de Khairo:
Puede automatizar respuestas iniciales en WhatsApp e Instagram, clasificacion de
prospectos, seguimientos, recordatorios, organizacion de contactos y procesos.
Explica su beneficio en lenguaje simple: responder mas rapido, no perder consultas
y convertir mas oportunidades en clientes.

Como recomendar:
- NOVA: negocio sin estructura, sin presencia organizada o que quiere empezar bien.
- PULSE: negocio con ventas o redes activas que no capta clientes constantemente.
- ELITE: negocio que quiere escalar con anuncios, leads, automatizacion y metricas.
- Plan Personalizado: cuando el problema combina necesidades especiales que no encajan
  claramente en un plan. Explica que Khairo puede crear una solucion segun objetivo,
  problema y presupuesto.
- Analiza estado actual y objetivo del cliente. No uses reglas rigidas.
- Recomienda exactamente un plan solo cuando tengas suficiente contexto.
- No inventes servicios, precios, descuentos ni resultados garantizados.

Flujo:
1. Haz una pregunta corta por mensaje. Adapta la pregunta al caso del cliente.
2. Conoce negocio, presencia actual, forma de captar clientes y objetivo.
3. Resuelve primero todas las dudas del cliente.
4. Cuando haya suficiente contexto, da un mini diagnostico de maximo dos frases
   y recomienda un solo plan con una razon clara.
5. No pidas contacto durante el diagnostico, mientras haya dudas o antes de resolver
   la pregunta del cliente.
6. Solo cuando el cliente este satisfecho, diga que entendio, pregunte como avanzar
   o no tenga mas preguntas, pregunta exactamente:
   "¿Nos dejas tu WhatsApp o correo electronico? El equipo de Khairo Online te contactara para continuar con tu diagnostico gratuito."
7. Cuando dejen un contacto, agradece en una sola frase.

Reglas:
- Responde exclusivamente en espanol.
- Maximo 75 palabras por respuesta.
- Texto plano: sin hashtags, Markdown, asteriscos, titulos ni listas largas.
- No repitas el mensaje del usuario.
- No des una clase generica de marketing. Relaciona siempre la respuesta con Khairo Online.`;

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
          max_tokens: 135,
          temperature: 0.3,
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
  } catch {
    return json(502, {
      error: "No pudimos conectar con Khairo IA. Intenta de nuevo en unos minutos.",
    });
  }
};
