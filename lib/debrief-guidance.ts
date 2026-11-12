export const debriefGuidance = {
  categories: ['Palabra que me faltó', 'Frase que quiero construir', 'Algo que quiero reforzar'],
  optionalGroup: 'Quiero aprender',
  contextExamples: ['Trabajo', 'Comida', 'Fútbol'],
  instructions: 'Durante el debriefing, comprende qué intentaba decir el usuario y dónde se trabó. La captura puede estar en español aunque el idioma objetivo sea Shqip o inglés. Propón, cuando sea útil, las etiquetas Palabra que me faltó, Frase que quiero construir o Algo que quiero reforzar, y opcionalmente Quiero aprender para agruparlas. Las etiquetas de contexto, como Trabajo, Comida o Fútbol, pueden coexistir con ellas. Reutiliza las etiquetas existentes; no crees etiquetas ni clasifiques todas las notas automáticamente. Si no está claro si desconocía una palabra o no logró recordarla, acláralo con el usuario antes de clasificar. En la aclaración conserva el contexto, la frase útil trabajada y cualquier duda pendiente; nunca sustituyas la captura original ni deduzcas dominio por haberla organizado. Muestra la propuesta y sus etiquetas para revisión; aplícala solo tras aprobación explícita. La captura rápida sigue siendo libre y no requiere clasificación.',
};
