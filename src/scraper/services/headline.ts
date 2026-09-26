/**
 * Limpieza editorial de titulares: genera un titular propio a partir del
 * original (quita coletillas del medio, etiquetas clickbait, mayusculas
 * sostenidas). El original se conserva en `originalTitle` como transparencia.
 */

const OUTLET_SUFFIX = /\s*[|｜]\s*[^|｜]{2,60}\s*$/;
const DASH_OUTLET = /\s*[–—-]\s*(el tiempo|el heraldo|el espectador|zona cero|semana|la patilla|el nacional|noticia al dia|pulzo|infobae|bluradio|caracol|rcn|efe|afp)\s*$/i;
const LEAD_TAG = /^(ultima hora|en vivo|atencion|atención|lo ultimo|lo último|urgente|fotos|fotos:|video|exclusivo)\s*:\s*/i;
const TRAIL_PAREN = /\s*\((video|fotos|foto|galeria|galería|audio|en vivo|ultima hora)\)\s*$/i;

export function cleanHeadline(raw: string | undefined | null): string {
  if (!raw) return '';
  let t = String(raw).replace(/\s+/g, ' ').trim();
  t = t.replace(OUTLET_SUFFIX, '').trim();
  t = t.replace(DASH_OUTLET, '').trim();
  t = t.replace(LEAD_TAG, '').trim();
  t = t.replace(TRAIL_PAREN, '').trim();
  // Mayusculas sostenidas -> tipo oracion (conserva siglas con puntos)
  const letters = t.replace(/[^a-zA-Záéíóúñü]/g, '');
  const upper = t.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '');
  if (letters.length > 12 && upper.length / letters.length > 0.85) {
    t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  return t || String(raw).trim();
}
