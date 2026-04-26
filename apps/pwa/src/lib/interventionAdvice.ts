export function getInterventionAdvice(riskLevel: number | string, isManual: boolean = false): { advice: string; resources: string[] | null } {
  let level = 1;
  if (typeof riskLevel === "string") {
    const l = riskLevel.toLowerCase();
    if (l === "high" || l === "3") level = 3;
    else if (l === "medium" || l === "2") level = 2;
  } else {
    level = Number(riskLevel);
  }

  if (level === 3 || isManual) {
    return {
      advice: "Actúa de inmediato. Asegúrate de que el menor esté físicamente a salvo y resguarda el dispositivo; toma capturas de pantalla de la interacción antes de borrar o bloquear cualquier contacto. Si la integridad del menor está en riesgo, contacta a las autoridades competentes.",
      resources: ["📞 Policía Cibernética: 088 (Centro Nacional de Respuesta)", "📞 SAPTEL (Apoyo Psicológico): 55 5259-8121"]
    };
  } else if (level === 2) {
    return {
      advice: "Recomendamos revisar juntos esta interacción. Explícale por qué este tipo de lenguaje o contenido puede ser dañino. Es un buen momento para reforzar las reglas sobre no compartir información personal con extraños en juegos o redes.",
      resources: null
    };
  } else {
    // Default / Nivel 1
    return {
      advice: "Aprovecha este momento para conversar con tu hijo/a sobre los contenidos que consume. Pregúntale de forma casual qué canales o streamers le interesan últimamente para mantener un canal de confianza abierto, sin que se sienta interrogado.",
      resources: null
    };
  }
}
