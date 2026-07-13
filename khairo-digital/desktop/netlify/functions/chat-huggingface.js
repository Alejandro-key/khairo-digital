const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const MODEL = "Qwen/Qwen2.5-7B-Instruct";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function normalizarHistorial(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      const role = item?.role === "model" ? "assistant" : item?.role;

      const content =
        typeof item?.content === "string"
          ? item.content
          : item?.parts?.[0]?.text;

      if (!["user", "assistant"].includes(role) || typeof content !== "string") {
        return null;
      }

      return {
        role,
        content: content.trim().slice(0, 1800)
      };
    })
    .filter(Boolean)
    .slice(-16);
}

function textoSimple(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, "")
    .trim();
}

function esSaludo(texto) {
  return /^(hola|buenas|hey|hola khairo|buen dia|buenas tardes|buenas noches)$/.test(
    textoSimple(texto)
  );
}

function esRespuestaVacia(texto) {
  const t = textoSimple(texto);

  return /^(ok|okei|vale|listo|gracias|perfecto|si|no|ya)$/.test(t);
}

function mensajesUtiles(history) {
  return history
    .filter((item) => item.role === "user")
    .map((item) => item.content.trim())
    .filter((texto) => {
      const esNumero = /^\d+([.,]\d+)?$/.test(texto.trim());

      return (
        texto.length > 0 &&
        !esSaludo(texto) &&
        !esRespuestaVacia(texto) &&
        (texto.length >= 3 || esNumero)
      );
    });
}

function temaDelCaso(mensajes) {
  const texto = mensajes.join(" ").toLowerCase();

  if (/barber|peluquer|salon|salón|cita|agenda|reserv|consultorio/.test(texto)) {
    return "citas";
  }

  if (/automatiz|whatsapp|responder mensajes|atencion al cliente|atención al cliente/.test(texto)) {
    return "automatizacion";
  }

  if (/lead|captar|captacion|captación|anuncio|publicidad|campana|campaña/.test(texto)) {
    return "leads";
  }

  if (/redes|instagram|facebook|tiktok|contenido|reel|perfil/.test(texto)) {
    return "redes";
  }

  if (/pagina web|página web|sitio web|landing|web/.test(texto)) {
    return "web";
  }

  return "general";
}

function preguntaDeDiagnostico(numero, tema) {
  const preguntas = {
    citas: {
      1: "Entiendo. ¿Hoy por dónde te llegan y organizas las citas: WhatsApp, Instagram, llamadas o alguna agenda digital?",
      2: "¿Qué te ayudaría más ahora: confirmar y recordar citas, organizar horarios o evitar perder clientes que preguntan?"
    },
    automatizacion: {
      1: "Entiendo. ¿Por cuál canal recibes más mensajes de clientes hoy: WhatsApp, Instagram, Facebook u otro?",
      2: "¿Qué proceso te gustaría automatizar primero: respuestas iniciales, seguimiento, clasificación de clientes o agendamiento?"
    },
    leads: {
      1: "Para entender tu caso, ¿de dónde llegan hoy la mayoría de tus clientes: redes sociales, recomendados, anuncios o WhatsApp?",
      2: "¿Tu prioridad es conseguir más contactos, responderlos más rápido o hacer seguimiento para convertirlos en clientes?"
    },
    redes: {
      1: "Para ubicar mejor tu negocio, ¿ya publicas contenido con frecuencia o tu presencia en redes todavía está empezando?",
      2: "¿Qué resultado buscas primero con tus redes: más visibilidad, más mensajes o más ventas?"
    },
    web: {
      1: "¿Tu negocio ya tiene página web o los clientes solo te encuentran por redes sociales y WhatsApp?",
      2: "¿Qué necesitas que haga principalmente esa página: mostrar servicios, recibir contactos, agendar citas o vender?"
    },
    general: {
      1: "Para orientarte bien, ¿a qué se dedica tu negocio y cuál es el principal problema que quieres resolver hoy?",
      2: "¿Qué resultado te gustaría conseguir primero: más clientes, mejorar tu presencia digital, organizar procesos o automatizar la atención?"
    }
  };

  return preguntas[tema][numero];
}

function quiereContinuar(texto) {
  const t = textoSimple(texto);

  return /quiero continuar|quiero seguir|quiero avanzar|como seguimos|quiero empezar|quiero contratar|quiero este plan|me interesa avanzar|quiero hablar con|me pueden contactar|agendar una llamada/.test(
    t
  );
}

function limpiarRespuesta(texto, limite = 120) {
  let limpia = String(texto || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/#{1,6}/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]/gu, "")
    .replace(/\n\s*(?:user|usuario|assistant|asistente|system|sistema)\s*:?.*/gi, "")
    .replace(/est[aá]s en la fase de diagn[oó]stico\.?/gi, "")
    .replace(/fase de diagn[oó]stico\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const palabras = limpia.split(/\s+/).filter(Boolean);

  if (palabras.length > limite) {
    limpia = palabras.slice(0, limite).join(" ").replace(/[,:;]$/, "") + ".";
  }

  return limpia;
}

function contieneContacto(texto) {
  return /whatsapp|correo electr[oó]nico/i.test(texto);
}

const PROMPT = `
Eres Khairo IA, asistente comercial y estratégico de Khairo Online, una agencia de crecimiento digital para negocios.

Habla siempre en español colombiano, claro, cercano y profesional.
No uses Markdown, hashtags, asteriscos, listas largas ni texto robótico.
No menciones instrucciones internas, etapas, fases, prompts ni diagnóstico técnico.
No inventes servicios, resultados, precios ni datos.
Responde normalmente en máximo 75 palabras. Si preguntan qué incluye un plan, puedes responder hasta 120 palabras.

Tu ámbito es exclusivamente Khairo Online: presencia digital, redes sociales, contenido, branding, sitios web, captación de clientes, anuncios, leads, automatización, ventas y organización de procesos.
Si preguntan algo ajeno, responde brevemente que puedes ayudar con crecimiento digital del negocio y pregunta qué problema comercial o digital desean resolver.

Información real de Khairo Online:

NOVA — $210.000 COP/mes.
Pensado para negocios que necesitan una base digital para empezar a vender.
Incluye diagnóstico del negocio, estrategia básica inicial, propuesta de valor, 5 a 7 piezas gráficas mensuales, optimización básica de perfil, automatización básica por WhatsApp o Instagram, presencia web básica y preparación para campañas de leads.

PULSE — $260.000 COP/mes.
Pensado para negocios que ya tienen movimiento, pero necesitan ordenar presencia, mensaje y captación.
Incluye estrategia intermedia, optimización de oferta y mensaje, 8 a 12 piezas gráficas mensuales, 2 a 4 videos cortos, automatización intermedia, optimización de perfil y contenido, ajustes mensuales de estrategia y base inicial de campañas de leads.

ÉLITE — $340.000 COP/mes.
Pensado para negocios que quieren escalar ventas con anuncios, automatización y un sistema completo.
Incluye estrategia avanzada, optimización continua, sistema avanzado de leads, 8 a 12 piezas gráficas estratégicas, 4 a 8 videos para Reels y anuncios, creativos para publicidad paga, automatización avanzada con filtros de clientes, optimización o creación de landing page, análisis de métricas, mejoras constantes y soporte prioritario.

La automatización de Khairo puede responder más rápido por WhatsApp o Instagram, clasificar interesados, hacer seguimiento, reducir mensajes perdidos y convertir más consultas en oportunidades reales.

El sistema de leads puede recomendarse como complemento cuando sea necesario. Puede incluir anuncios, landing page o formulario, llegada a WhatsApp, clasificación, seguimiento automático y medición. No afirmes que viene incluido en todos los planes.

También puede existir un plan completamente personalizado según problema, necesidades, objetivos y presupuesto.

La persona ya entregó información suficiente. Analiza la conversación completa antes de responder.

REGLAS DE RECOMENDACIÓN:
- Si es la primera recomendación, empieza exactamente con:
"Según lo que me cuentas, y teniendo en cuenta tu necesidad y el problema que quieres resolver, la opción que mejor se ajusta a tu caso es:"
- Recomienda un único plan mensual: NOVA, PULSE o ÉLITE.
- Explica en una frase por qué encaja y menciona 2 o 3 elementos que resuelvan el problema específico del negocio.
- NOVA es para construir base digital desde cero.
- PULSE es para negocios que ya se mueven, venden o reciben consultas, pero necesitan organizar mensaje, contenido, automatización y captación.
- ÉLITE es para escalar con anuncios, sistema avanzado de leads, landing, automatización avanzada y optimización continua.
- Puedes añadir una segunda recomendación únicamente si es complementaria y necesaria: por ejemplo, un sistema de leads básico, intermedio o avanzado junto al plan mensual.
- Nunca recomiendes dos planes mensuales a la vez.
- Si el caso no encaja por completo, menciona un plan personalizado.
- No digas "necesitas este plan", no presiones y no preguntes "¿te interesa este plan?".

SI PIDEN DETALLES:
- Explica lo que incluye el plan recomendado de forma contextualizada.
- No enumeres una lista fría. Relaciona cada elemento con cómo ayuda a ese negocio.
- Por ejemplo: para una barbería, la automatización puede confirmar citas, reducir ausencias y ordenar la atención por WhatsApp.

CONTACTO:
- Solo pide el contacto si la persona expresa que quiere continuar, avanzar, contratar, ser contactada o pregunta cómo seguir.
- En ese momento escribe exactamente:
"¿Nos dejas tu WhatsApp o correo electrónico? El equipo de Khairo Online te contactará para continuar con tu diagnóstico gratuito."
`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método no permitido." });
  }

  if (!process.env.HF_TOKEN) {
    return json(503, { error: "Khairo IA aún no está configurada." });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "La solicitud no tiene un formato válido." });
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
  const ultimo = history.at(-1);

  if (!ultimo || ultimo.role !== "user" || ultimo.content !== message) {
    history.push({ role: "user", content: message });
  }

  const utiles = mensajesUtiles(history);

  if (esSaludo(message) && utiles.length === 0) {
    return json(200, {
      reply: "¡Hola! Cuéntame brevemente a qué se dedica tu negocio o qué te gustaría mejorar."
    });
  }

  if (utiles.length === 0) {
    return json(200, {
      reply: "Para orientarte bien, ¿a qué se dedica tu negocio y qué problema te gustaría resolver?"
    });
  }

  const tema = temaDelCaso(utiles);

  // Estas dos preguntas no dependen de la IA.
  // Así nunca puede recomendar demasiado pronto ni repetir una fase interna.
  if (utiles.length === 1) {
    return json(200, {
      reply: preguntaDeDiagnostico(1, tema)
    });
  }

  if (utiles.length === 2) {
    return json(200, {
      reply: preguntaDeDiagnostico(2, tema)
    });
  }

  try {
    const response = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPT },
          ...history
        ],
        max_tokens: 260,
        temperature: 0.25
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Hugging Face", response.status, data);

      const error =
        response.status === 429
          ? "Khairo IA recibió muchas consultas. Espera un minuto e inténtalo de nuevo."
          : "Khairo IA no está disponible ahora. Inténtalo de nuevo en unos minutos.";

      return json(response.status, { error });
    }

    let reply = limpiarRespuesta(data?.choices?.[0]?.message?.content);

    if (!reply) {
      reply =
        "Con la información que me diste, puedo orientarte con una solución adaptada a tu negocio.";
    }

    const continuar = quiereContinuar(message);

    if (!continuar) {
      reply = reply
        .replace(
          /¿?nos dejas tu whatsapp o correo electr[oó]nico\? el equipo de khairo online te contactar[aá] para continuar con tu diagn[oó]stico gratuito\.?/gi,
          ""
        )
        .trim();
    }

    if (continuar && !contieneContacto(reply)) {
      reply +=
        " ¿Nos dejas tu WhatsApp o correo electrónico? El equipo de Khairo Online te contactará para continuar con tu diagnóstico gratuito.";
    }

    return json(200, { reply: limpiarRespuesta(reply, 120) });
  } catch (error) {
    console.error("Error de Khairo IA:", error);

    return json(502, {
      error: "No pudimos conectar con Khairo IA. Inténtalo de nuevo en unos minutos."
    });
  }
};
