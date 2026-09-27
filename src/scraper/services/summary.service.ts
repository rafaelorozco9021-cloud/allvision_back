import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  /**
   * Los feeds WordPress/Arc anexan al `content:encoded` un texto de atribucion
   * que empieza con "The post <titular>". Al truncar a 150 chars suele quedar
   * cortado ("The post Juegos Suramericanos 2026: Brazil dominó y…"), asi que
   * no basta con buscar "appeared first on": hay que cortar en el arranque.
   *
   * Solo corta si despues viene una mayuscula, comilla, ellipsis o fin de
   * texto, para no partir un "The post office was closed..." legitimo.
   * OJO: este patron va SIN flag /i a proposito; con /i el rango [A-Z] tambien
   * acepta minusculas y el corte seria erroneo.
   */
  private static readonly BOILERPLATE = /\s*The post(?=\s+[A-ZÁÉÍÓÚÜÑ"“”'‘’]|\s*…|\s*$)/;

  /** Variante larga, cuando el enlace al medio si completo esta presente. */
  private static readonly BOILERPLATE_FULL = /\s*The post\s[\s\S]*?appeared first on\s[\s\S]*$/i;

  /**
   * Resumen estilo snippet (~150 caracteres): cita breve del `description` del
   * feed, no sustituye al original.
   */
  generateSummary(text: string): string {
    if (!text || text.trim().length === 0) return '';
    const cleaned = this.normalize(text);
    if (cleaned.length <= 150) return cleaned;
    const cut = cleaned.substring(0, 150);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 100 ? cut.substring(0, lastSpace) : cut).trim() + '…';
  }

  /** Decodifica entidades, quita boilerplate y colapsa espacios. */
  private normalize(text: string): string {
    let t = text
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&amp;/g, '&');

    t = t
      .replace(SummaryService.BOILERPLATE_FULL, '')
      .replace(SummaryService.BOILERPLATE, '');

    return t.replace(/\s+/g, ' ').trim();
  }
}
