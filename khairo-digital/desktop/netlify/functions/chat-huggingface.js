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
  const esNumero = /^\d+([.,]\d+)?$/.test(t);

  return (
    (t.length < 4 && !esNumero) ||
    /^(hola|buenas|hey|ok|okei|si|sí|no|gracias|vale|listo|ya|perfecto)$/i.test(t)
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

  if (respuestas.length <= 1) return "pregunta_1";
  if (respuestas.length === 2) return "pregunta_2";

  return "recomendacion";
}

function obtenerTema(messages) {
  const texto = mensajesDelUsuario(messages).join(" ").toLowerCase();

  if (/cita|agenda|reserv|barber|peluquer|sal[oó]n|consultorio/.test(texto)) {
    return "citas";
  }

  if (/automatiz|whatsapp|instagram.*mensaje|responder.*cliente/.test(texto)) {
    return "automatizacion";
  }

  if (/lead|captar|captaci[oó]n|anuncio|publicidad|campaña|campana/.test(texto)) {
    return "leads";
  }

  if (/redes|instagram|facebook|tiktok|contenido|reel|perfil/.test(texto)) {
    return "redes";
  }

  if (/web|p[aá]gina|landing|sitio/.test(texto)) {
    return "web";
  }

  return "general";
}

function preguntaDiagnostico(fase, tema) {
  const preguntas = {
    citas: {
      pregunta_1:
        "Entiendo. ¿Hoy por dónde te llegan y organizas las citas: WhatsApp, Instagram, llamadas o alguna agenda digital?",
      pregunta_2:
        "¿Qué te gustaría resolver primero: confirmaciones y recordatorios, organizar horarios o evitar perder clientes que preguntan?"
    },
    automatizacion: {
      pregunta_1:
        "Entiendo. ¿Por cuál canal recibes más mensajes de clientes hoy: WhatsApp, Instagram, Facebook u otro?",
      pregunta_2:
        "¿Qué proceso te gustaría automatizar primero: respuestas iniciales, seguimiento, clasificación de clientes o agendamiento?"
    },
    leads: {
      pregunta_1:
        "Para entender tu caso, ¿de dónde llegan hoy la mayoría de tus clientes: redes sociales, recomendados, anuncios o WhatsApp?",
      pregunta_2:
        "¿Tu prioridad es conseguir más contactos, responderlos más rápido o hacer seguimiento para convertirlos en clientes?"
    },
    redes: {
      pregunta_1:
        "Para ubicar mejor tu negocio, ¿ya publicas contenido con frecuencia o tu presencia en redes todavía está empezando?",
      pregunta_2:
        "¿Qué resultado buscas primero con tus redes: más visibilidad, más mensajes o más ventas?"
    },
    web: {
      pregunta_1:
        "¿Tu negocio ya tiene una página web o los clientes solo te encuentran por redes sociales y WhatsApp?",
      pregunta_2:
        "¿Qué necesitas que haga principalmente esa página: mostrar servicios, recibir contactos, agendar citas o vender?"
    },
    general: {
      pregunta_1:
        "Para orientarte bien, ¿a qué se dedica tu negocio y cuál es el principal problema que quieres resolver hoy?",
      pregunta_2:
        "¿Qué resultado te gustaría conseguir primero: más clientes, mejorar tu presencia digital, organizar procesos o automatizar la atención?"
    }
  };

  return preguntas[tema][fase];
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

    const ultimoMensaje = String(
      historial.filter((m) => m.role === "user").slice(-1)[0]?.content || ""
    ).toLowerCase();

    if (/^(qu[eé] eres|qui[eé]n eres|que haces|qu[eé] haces)[?¡! ]*$/i.test(ultimoMensaje)) {
      return respuesta(200, {
        reply:
          "Soy Khairo IA, el asistente estratégico de Khairo Online. Te ayudo a identificar cómo mejorar la presencia digital, captación de clientes, contenido, anuncios o automatización de tu negocio."
      });
    }

    const fase = detectarFase(historial);
    const tema = obtenerTema(historial);

    // Las dos preguntas de diagnóstico son controladas:
    // no dependen de la IA y nunca recomiendan planes antes de tiempo.
    if (fase === "pregunta_1" || fase === "pregunta_2") {
      return respuesta(200, {
        reply: preguntaDiagnostico(fase, tema)
      });
    }

    const instrucciones = `
Eres Khairo IA, asistente comercial y estratégico de Khairo Online, una agencia de crecimiento digital para negocios.

Habla siempre en español colombiano, claro, cercano y profesional.
No uses Markdown, hashtags, asteriscos, títulos, listas largas ni texto robótico.
No inventes servicios, resultados, precios ni datos.
Normalmente responde en máximo 75 palabras. Si la persona pregunta qué incluye un plan, puedes responder hasta 120 palabras.

Solo ayudas con temas de Khairo Online: presencia digital, redes sociales, contenido, branding, páginas web, captación de clientes, anuncios, leads, automatización, ventas y organización de procesos.
Si preguntan algo ajeno, di brevemente que puedes ayudar con crecimiento digital del negocio y vuelve al tema comercial.

Información real de Khairo Online:

NOVA — $210.000 COP/mes.
Para negocios que necesitan una base digital para empezar a vender.
Incluye diagnóstico del negocio, estrategia básica, propuesta de valor, 5 a 7 piezas gráficas mensuales, optimización básica de perfil, automatización básica por WhatsApp o Instagram, presencia web básica y preparación para campañas de leads.

PULSE — $260.000 COP/mes.
Para negocios que ya tienen movimiento, pero deben ordenar su presencia, mensaje y captación.
Incluye estrategia intermedia, optimización de oferta y mensaje, 8 a 12 piezas gráficas mensuales, 2 a 4 Reels, automatización intermedia, optimización de perfil y contenido, ajustes mensuales y base inicial de campañas de leads.

ÉLITE — $340.000 COP/mes.
Para negocios que quieren escalar ventas con anuncios, automatización y un sistema completo.
Incluye estrategia avanzada, optimización continua, sistema avanzado de leads, 8 a 12 piezas estratégicas, 4 a 8 videos, creativos para publicidad, automatización avanzada con filtros, landing page, análisis de métricas y mejoras constantes, además de soporte prioritario.

La automatización ayuda a responder más rápido por WhatsApp o Instagram, clasificar interesados, hacer seguimiento, reducir mensajes perdidos y convertir más consultas en oportunidades reales.

El sistema de leads puede recomendarse aparte cuando haga falta. Puede incluir anuncios, landing page o formulario, llegada a WhatsApp, clasificación, seguimiento automático y medición. No digas que viene incluido en todos los planes.

Khairo también puede crear un plan completamente personalizado según problema, objetivos, necesidades y presupuesto.

La persona ya respondió las preguntas necesarias. Ahora analiza la conversación antes de responder.

REGLAS PARA RECOMENDAR:
- Resume el problema detectado en una frase corta.
- Antes de nombrar una recomendación, usa exactamente esta frase:
"Según lo que me cuentas, y teniendo en cuenta tu necesidad y el problema que quieres resolver, la opción que mejor se ajusta a tu caso es:"
- Recomienda solamente un plan mensual: NOVA, PULSE o ÉLITE.
- Explica brevemente por qué encaja y menciona 2 o 3 elementos que solucionan el problema específico de esa persona.
- Si pregunta qué más incluye el plan, explica los demás elementos de forma contextualizada. No des una lista fría: explica cómo cada cosa ayudaría a su negocio.
- Puedes añadir una segunda recomendación solo si es complementaria y necesaria: por ejemplo, un sistema de leads básico, intermedio o avanzado junto al plan. Nunca recomiendes dos planes mensuales.
- No digas "necesitas este plan", no presiones y no preguntes "¿te interesa este plan?".
- Si el caso no encaja por completo, menciona la posibilidad de un plan personalizado.

CONTACTO:
Solo pide contacto cuando la persona diga que ya entendió, está satisfecha, quiere continuar o pregunta cómo seguir.
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

    const texto =
      resultado?.choices?.[0]?.message?.content ||
      "Con la información que me diste, puedo orientarte con una solución adaptada a tu negocio.";

    return respuesta(200, {
      reply: limpiarTexto(texto, 120)
    });
  } catch (error) {
    console.error(error);

    return respuesta(500, {
      error: "Ocurrió un problema temporal con Khairo IA. Inténtalo nuevamente."
    });
  }
};
