/**
 * Clasificador tematico por reglas (sin ML): combina la categoria del RSS,
 * la seccion visible en la URL y palabras clave en titulo+resumen.
 * Categorias: politica, judiciales, sucesos, tecnologia, economia,
 * deportes, opinion, mundo, salud, cultura, generales.
 */

export type NewsCategory =
  | 'politica' | 'judiciales' | 'sucesos' | 'tecnologia' | 'economia'
  | 'deportes' | 'opinion' | 'mundo' | 'salud' | 'cultura' | 'generales';

export const NEWS_CATEGORIES: NewsCategory[] = [
  'generales', 'politica', 'judiciales', 'sucesos', 'tecnologia',
  'economia', 'deportes', 'opinion', 'mundo', 'salud', 'cultura',
];

/** 'judiciales' incluye sucesos (criterio editorial del menu). */
export function expandCategory(cat: string): string[] {
  if (cat === 'judiciales') return ['judiciales', 'sucesos'];
  return [cat];
}

function norm(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FEED_MAP: [RegExp, NewsCategory][] = [
  [/economia|economic/, 'economia'],
  [/deporte|futbol|sport/, 'deportes'],
  [/judicial|justicia/, 'judiciales'],
  [/suceso/, 'sucesos'],
  [/opinion|editorial/, 'opinion'],
  [/tecnologia|tecno/, 'tecnologia'],
  [/politica|politics/, 'politica'],
  [/mundo|internacional|world/, 'mundo'],
  [/salud|health/, 'salud'],
  [/cultura|entretenimiento|ocio/, 'cultura'],
];

const URL_MAP: [RegExp, NewsCategory][] = [
  [/\/economia\//, 'economia'],
  [/\/(deportes|futbol)[\/-]/, 'deportes'],
  [/\/(judicial|justicia)[\/-]/, 'judiciales'],
  [/\/sucesos?\//, 'sucesos'],
  [/\/(opinion|editorial)[\/-]/, 'opinion'],
  [/\/(tecnologia|tecno)[\/-]/, 'tecnologia'],
  [/\/politica\//, 'politica'],
  [/\/(mundo|internacional)[\/-]/, 'mundo'],
  [/\/salud\//, 'salud'],
  [/\/(cultura|entretenimiento)[\/-]/, 'cultura'],
];

const KEYWORDS: [NewsCategory, string[]][] = [
  ['politica', ['petro', 'presidente', 'presidencia', 'gobierno', 'congreso', 'senado', 'senador', 'camara', 'alcalde', 'alcaldia', 'gobernador', 'eleccion', 'elecciones', 'candidato', 'ministro', 'ministra', 'votacion', 'reforma', 'decreto', 'concejo', 'diputado', 'canciller', 'embajador', 'diplomacia', 'uribe', 'cepeda', 'fajardo', 'de la espriella', 'asamblea', 'alcaldesa']],
  ['judiciales', ['fiscalia', 'fiscal', 'juzgado', 'juez', 'corte', 'tribunal', 'condena', 'condenado', 'captura', 'capturan', 'capturado', 'allanamiento', 'imputacion', 'extradicion', 'extraditado', 'carcel', 'prision', 'corrupcion', 'peculado', 'soborno', 'delito', 'procuraduria', 'contraloria', 'embargo', 'sentencia', 'absuelto']],
  ['sucesos', ['accidente', 'temblor', 'sismo', 'terremoto', 'incendio', 'inundacion', 'deslizamiento', 'avalancha', 'muerto', 'muerta', 'muertos', 'herido', 'heridos', 'choque', 'tragedia', 'rescate', 'rescatan', 'desaparecido', 'desaparecida', 'emergencia', 'lluvias', 'victima', 'homicidio', 'asesinato', 'sicariato', 'masacre', 'atraco', 'secuestro', 'fallecio', 'hallan cuerpo', 'derrumbe']],
  ['tecnologia', ['tecnologia', 'inteligencia artificial', 'robot', 'software', 'aplicacion', 'digital', 'internet', 'ciberseguridad', 'hacker', 'startup', 'innovacion', 'videojuego', 'redes sociales', 'algoritmo', 'criptomoneda', 'bitcoin']],
  ['economia', ['economia', 'empleo', 'desempleo', 'salario', 'salarios', 'inflacion', 'dolar', 'precio', 'precios', 'empresa', 'empresas', 'ecopetrol', 'petroleo', 'banco', 'impuesto', 'pib', 'comercio', 'pension', 'pensiones', 'arancel', 'exportacion', 'millonario', 'billones', 'gasolina', 'acueducto', 'tarifa']],
  ['deportes', ['futbol', 'liga betplay', 'copa', 'mundial', 'junior', 'millonarios', 'santa fe', 'seleccion', 'champions', 'dimayor', 'gol', 'olimpico', 'juegos olimpicos', 'medalla', 'atleta', 'maraton', 'boxeo', 'ciclismo', 'james rodriguez']],
  ['opinion', ['editorial', 'columna']],
  ['mundo', ['gaza', 'ucrania', 'rusia', 'israel', 'franja de gaza', 'otan', 'kremlin']],
  ['salud', ['salud', 'hospital', 'vacuna', 'virus', 'epidemia', 'upc', 'medico', 'clinica', 'enfermedad', 'contagio']],
  ['cultura', ['cultura', 'cine', 'musica', 'concierto', 'festival', 'libro', 'arte', 'carnaval', 'teatro', 'pelicula', 'serie', 'reality']],
];

const PRIORITY: NewsCategory[] = [
  'opinion', 'judiciales', 'sucesos', 'politica', 'economia',
  'tecnologia', 'deportes', 'salud', 'mundo', 'cultura',
];

export interface ClassifyInput {
  title?: string;
  summary?: string;
  url?: string;
  feedCategories?: string[];
}

export function classifyCategory(input: ClassifyInput): NewsCategory {
  const scores = new Map<NewsCategory, number>();

  for (const raw of input.feedCategories || []) {
    const c = norm(raw);
    for (const [re, cat] of FEED_MAP) {
      if (re.test(c)) scores.set(cat, (scores.get(cat) || 0) + 5);
    }
  }

  const url = (input.url || '').toLowerCase();
  for (const [re, cat] of URL_MAP) {
    if (re.test(url)) scores.set(cat, (scores.get(cat) || 0) + 4);
  }

  const title = norm(input.title);
  const summary = norm(input.summary);
  for (const [cat, words] of KEYWORDS) {
    let hits = 0;
    for (const w of words) {
      const wn = norm(w);
      if (title.includes(wn)) hits += 2;
      else if (summary.includes(wn)) hits += 1;
    }
    if (hits > 0) scores.set(cat, (scores.get(cat) || 0) + hits);
  }

  let best: NewsCategory = 'generales';
  let bestScore = 2; // umbral minimo: evita clasificar por una sola mencion debil en el resumen
  for (const cat of PRIORITY) {
    const s = scores.get(cat) || 0;
    if (s > bestScore) {
      bestScore = s;
      best = cat;
    }
  }
  return best;
}
