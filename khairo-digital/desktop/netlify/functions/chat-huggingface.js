const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const MODEL = "Qwen/Qwen2.5-7B-Instruct";

function headers() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function respuesta(statusCode, body) {
  return {
    statusCode,
    headers: headers(),
    body: JSON.stringify(body)
  };
}

function limpiarTexto(texto, maxPalabras) {
  let limpio = String(texto || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/#{1,6}/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^[\s•\-–]+\s*/gm, "")
    .replace(/(Usuario|Asistente|Khairo IA)\s*:/gi, "")
    .replace(/[\u4E00-\u9FFF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const palabras = limpio.split(/\s+/);

  if (palabras.length > maxPalabras) {
    limpio = palabras.slice(0, maxPalabras).join(" ").replace(/[,:;]$/, "") + ".";
  }

  return limpio;
}

function esMensajePocoUtil(texto) {
  const t = texto.toLowerCase().trim();

  return (
    t.length < 4 ||
    /^(hola|buenas|hey|ok|okei|si|sí|no|gracias|vale|listo|ya|perfecto|que eres|qu[eé] eres|qui[eé]n eres|como est[aá]s)$/i.test(t)
  );
}

function mensajesDelUsuario(messages) {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => String(m.content || "").trim())
    .filter((m) => !esMensajePocoUtil(m));
}

function detectarFase(messages) {
  const respuestas = mensajesDelUsuario(messages);

  if (respuestas.length <= 1) return "diagnostico_1";
  if (respuestas.length === 2) return "diagnostico_2";

  return "recomendacion";
}

function ultimaRespuestaUsuario(messages) {
  const usuarios = messages
    .filter((m) => m.role === "user")
    .map((m) => String(m.content || "").trim())
    .filter(Boolean);

  return usuarios[usuarios.length - 1] || "";
}

function preguntaRespaldo(fase, textoUsuario) {
  const t = textoUsuario.toLowerCase();

  if (/cita|agenda|reserv/.test(t)) {
    return fase === "diagnostico_1"
      ? "Entiendo. ¿Hoy cómo agendan las citas: por WhatsApp, Instagram, llamadas o alguna agenda digital?"
      : "¿Aproximadamente cuántas citas reciben al mes y qué problema te gustaría eliminar primero: demoras, olvidos o mensajes perdidos?";
  }

  if (/lead|cliente|captar|captaci[oó]n|anuncio|publicidad/.test(t)) {
    return fase === "diagnostico_1"
      ? "Entiendo. ¿Actualmente de dónde llegan la mayoría de tus clientes: redes sociales, recomendados, anuncios o WhatsApp?"
      : "¿Tu prioridad es conseguir más contactos, responderlos más rápido o hacer seguimiento para que compren?";
  }

  if (/redes|instagram|contenido|reel|perfil/.test(t)) {
    return fase === "diagnostico_1"
      ? "Para entender mejor tu caso: ¿ya publicas contenido con frecuencia o tu presencia en redes todavía está empezando?"
      : "¿Qué buscas lograr primero con tus redes: más visibilidad, más mensajes o más ventas?";
  }

  return fase === "diagnostico_1"
    ? "Para orientarte bien, ¿a qué se dedica tu negocio y cuál es el principal problema que quieres resolver hoy?"
    : "¿Qué resultado te gustaría conseguir primero: más clientes, mejorar tu presencia digital, organizar procesos o automatizar la atención?";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return respuesta(200, {});
  }

  if (event.httpMethod !== "POST") {
    return respuesta(405, { error: "Método no permitido." });
  }

  try {
    const data = JSON.parse(event.body || "{}");

    let messages =
      data.messages ||
      data.history ||
      data.conversationHistory ||
      [];

    if (!Array.isArray(messages)) messages = [];

    if (messages.length === 0 && data.message) {
      messages = [{ role: "user", content: data.message }];
    }

    const historial = messages
      .filter((m) => m && m.content)
      .slice(-14)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
      }));

    const fase = detectarFase(historial);
    const ultimoMensaje = ultimaRespuestaUsuario(historial);

    const instrucciones = `
Eres Khairo IA, asistente comercial y estratégico de Khairo Online, una agencia de crecimiento digital para negocios.

Habla siempre en español colombiano, claro, cercano y profesional.
No uses Markdown, hashtags, asteriscos, títulos, listas largas ni texto robótico.
No inventes servicios, resultados, precios ni datos.
Responde máximo en 75 palabras. Si piden detalles de un plan recomendado, puedes usar hasta 120 palabras.

Solo puedes ayudar en temas de Khairo Online: presencia digital, redes sociales, contenido, branding, páginas web, captación de clientes, anuncios, leads, automatización, ventas y organización de procesos.
Si preguntan algo ajeno a estos temas, di brevemente que puedes ayudar con crecimiento digital del negocio y pregunta qué problema comercial o digital desean resolver.

Información real de Khairo Online:

NOVA — $210.000 COP/mes.
Para negocios que necesitan una base digital para empezar a vender.
Incluye diagnóstico del negocio, estrategia básica, propuesta de valor, 5 a 7 piezas gráficas mensuales, optimización básica de perfil, automatización básica por WhatsApp o Instagram, presencia web básica y preparación para campañas de leads.

PULSE — $260.000 COP/mes.
Para negocios que ya tienen movimiento, pero deben ordenar su presencia, mensaje y captación.
Incluye estrategia intermedia, optimización de oferta y mensaje, 8 a 12 piezas gráficas mensuales, 2 a 4 Reels, automatización intermedia, optimización de perfil y contenido, ajustes mensuales y base inicial de campañas de leads.

ÉLITE — $340.000 COP/mes.
Para negocios que quieren escalar ventas con anuncios, automatización y un sistema completo.
Incluye estrategia avanzada, optimización continua, sistema avanzado de leads, 8 a 12 piezas estratégicas, 4 a 8 videos, creativos para publicidad, automatización avanzada con filtros, landing page, análisis de métricas y soporte prioritario.

La automatización ayuda a responder más rápido por WhatsApp o Instagram, clasificar interesados, hacer seguimiento, reducir mensajes perdidos y convertir más consultas en oportunidades reales.

El sistema de leads puede recomendarse aparte cuando haga falta. Puede incluir anuncios, landing page o formulario, llegada a WhatsApp, clasificación, seguimiento automático y medición. No digas que viene incluido en todos los planes.

Khairo también puede crear un plan completamente personalizado según problema, objetivos, necesidades y presupuesto.

FASE ACTUAL: ${fase}

REGLAS OBLIGATORIAS:

Si la fase es diagnostico_1:
- No menciones NOVA, PULSE, ÉLITE, precios ni planes.
- No recomiendes ningún servicio todavía.
- Reconoce brevemente el problema.
- Haz UNA sola pregunta concreta sobre la situación actual del negocio.
- Debes diagnosticar antes de ofrecer.

Si la fase es diagnostico_2:
- No menciones NOVA, PULSE, ÉLITE, precios ni planes.
- No recomiendes ningún servicio todavía.
- Haz UNA segunda pregunta útil y distinta.
- Busca entender el objetivo, volumen de clientes, problema principal, presencia digital actual, canales de atención o presupuesto aproximado.
- Haz solamente una pregunta.

Si la fase es recomendacion:
- Resume el problema detectado en una frase corta.
- Antes de nombrar una recomendación, usa esta frase exacta:
"Según lo que me cuentas, y teniendo en cuenta tu necesidad y el problema que quieres resolver, la opción que mejor se ajusta a tu caso es:"
- Recomienda un solo plan mensual y explica por qué encaja.
- Menciona 2 o 3 elementos del plan que solucionan directamente el problema de esa persona.
- Si la persona pide más detalles, explica el plan completo de forma adaptada a su caso. Relaciona los elementos del plan con resultados prácticos; no des una lista fría ni repitas solamente el precio.
- Puedes añadir una segunda recomendación complementaria solamente si aporta algo diferente y necesario. Por ejemplo: un plan mensual más un sistema de leads básico, intermedio o avanzado.
- Nunca recomiendes dos planes mensuales al mismo tiempo.
- No digas "necesitas este plan", no presiones y no preguntes "¿te interesa este plan?".
- Si el caso no encaja exactamente, propone un plan personalizado.

CONTACTO:
Solo pide contacto si la persona dice que ya entendió, está satisfecha, quiere continuar o pregunta cómo seguir.
En ese momento escribe exactamente:
"¿Nos dejas tu WhatsApp o correo electrónico? El equipo de Khairo Online te contactará para continuar con tu diagnóstico gratuito."
`;

    const apiResponse = await fetch(HF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HF_TOKEN}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: instrucciones },
          ...historial
        ],
        temperature: 0.25,
        max_tokens: 240
      })
    });

    const resultado = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error(resultado);

      return respuesta(500, {
        error: "Khairo IA no pudo responder en este momento. Inténtalo nuevamente."
      });
    }

    let texto = resultado?.choices?.[0]?.message?.content || "";

    const mencionoPlanMuyPronto =
      fase !== "recomendacion" &&
      /\b(nova|pulse|élite|elite|plan|cop\/mes|\$210|\$260|\$340)\b/i.test(texto);

    if (mencionoPlanMuyPronto) {
      texto = preguntaRespaldo(fase, ultimoMensaje);
    }

    const limite = fase === "recomendacion" ? 120 : 55;

    return respuesta(200, {
      reply: limpiarTexto(texto, limite)
    });
  } catch (error) {
    console.error(error);

    return respuesta(500, {
      error: "Ocurrió un problema temporal con Khairo IA. Inténtalo nuevamente."
    });
  }
};
