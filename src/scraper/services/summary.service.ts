import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  /** Resumen estilo snippet (~150 caracteres): cita breve, no sustituye al original. */
  generateSummary(text: string): string {
    if (!text || text.trim().length === 0) return '';
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const max = 150;
    if (cleanText.length <= max) return cleanText;
    const cut = cleanText.substring(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 100 ? cut.substring(0, lastSpace) : cut).trim() + '…';
  }
}
