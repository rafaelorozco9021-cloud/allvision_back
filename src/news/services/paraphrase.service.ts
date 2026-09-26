import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { NewsEntity } from '../entities/news.entity';
import { cleanHeadline } from '../../scraper/services/headline';

/**
 * Parafrasis total de titulares via IA (gateway OmniRoute, compatible OpenAI).
 * - Solo se parafasea el representante de cada historia, una vez.
 * - El gateway responde en SSE aunque no se pida stream: se ensambla igual.
 * - Si la IA falla o el texto no pasa validacion, se conserva el titular limpio.
 * - Sin API key configurada el paso se omite en silencio.
 */
@Injectable()
export class ParaphraseService {
  private readonly logger = new Logger(ParaphraseService.name);
  private warnedNoKey = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
  ) {}

  private get conf() {
    return {
      baseUrl: (this.configService.get<string>('AI_BASE_URL', '') || '').replace(/\/$/, ''),
      apiKey: this.configService.get<string>('AI_API_KEY', '') || '',
      model: this.configService.get<string>('AI_MODEL', 'auto/cheap') || 'auto/cheap',
      limit: this.configService.get<number>('AI_PARAPHRASE_LIMIT', 20) || 20,
      timeout: this.configService.get<number>('AI_TIMEOUT_MS', 45000) || 45000,
      concurrency: 4,
    };
  }

  /** Parafrasea UN titular. Retorna null si no se pudo (usar fallback). */
  async paraphraseTitle(rawTitle: string): Promise<string | null> {
    const { baseUrl, apiKey, model, timeout } = this.conf;
    if (!baseUrl || !apiKey) {
      if (!this.warnedNoKey) {
        this.warnedNoKey = true;
        this.logger.warn('IA no configurada (AI_BASE_URL/AI_API_KEY): se omiten parafrasis');
      }
      return null;
    }
    try {
      const res = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          temperature: 0.2,
          max_tokens: 80,
          messages: [
            {
              role: 'system',
              content:
                'Reescribe titulares de noticias con tus propias palabras, fiel al hecho, maximo 90 caracteres, sin clickbait y sin nombrar medios. Responde SOLO con el titular, sin comillas ni explicaciones.',
            },
            { role: 'user', content: `Reescribe: ${rawTitle}` },
          ],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout,
          responseType: 'text',
        },
      );
      const text = this.extractText(res.data, res.headers?.['content-type'] as string);
      return this.validate(rawTitle, text);
    } catch (e: any) {
      this.logger.debug(`Parafrasis fallo: ${e.message}`);
      return null;
    }
  }

  /** Ensambla texto desde respuesta JSON OpenAI o cuerpo SSE. */
  private extractText(data: any, contentType?: string): string {
    if (typeof data !== 'string') {
      return String(data?.choices?.[0]?.message?.content || '').trim();
    }
    if (!contentType || !contentType.includes('event-stream')) {
      try {
        const obj = JSON.parse(data);
        return String(obj?.choices?.[0]?.message?.content || '').trim();
      } catch {
        return '';
      }
    }
    const out: string[] = [];
    for (const line of data.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta;
        if (delta?.content) out.push(delta.content);
      } catch {
        /* chunk parcial, ignorar */
      }
    }
    return out.join('').trim();
  }

  /** Acepta solo reescrituras reales y seguras; si no, null (fallback). */
  private validate(original: string, candidate: string): string | null {
    if (!candidate) return null;
    let t = candidate.replace(/^["'«“]+|["'»”]+$/g, '').replace(/\s+/g, ' ').trim();
    if (t.length < 15 || t.length > 140) return null;
    const n = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();
    if (n(t) === n(original)) return null; // identico: no aporta
    if (/^(lo siento|no puedo|como ia|soy un)/i.test(t)) return null; // negativa del modelo
    return t;
  }

  /**
   * Parafrasea representantes pendientes (titleAi=false) y reintenta los que
   * quedaron con version limpia (max 2 intentos). Tope por ciclo.
   */
  async paraphrasePending(): Promise<{ attempted: number; rewritten: number }> {
    const { limit, concurrency } = this.conf;
    if (!this.conf.baseUrl || !this.conf.apiKey) {
      await this.paraphraseTitle('ping');
      return { attempted: 0, rewritten: 0 };
    }
    const fresh = await this.newsRepository.find({
      where: { active: true, isRepresentative: true, titleAi: false },
      order: { sourceCount: 'DESC', viralScore: 'DESC' },
      take: limit,
    });
    const queue = [...fresh];
    if (queue.length < limit) {
      const done = await this.newsRepository.find({
        where: { active: true, isRepresentative: true, titleAi: true },
        order: { sourceCount: 'DESC', viralScore: 'DESC' },
        take: limit * 2,
      });
      for (const m of done) {
        if (queue.length >= limit) break;
        if ((m.titleAiTries || 0) >= 2) continue;
        if (queue.some((q) => q.id === m.id)) continue;
        const raw = m.originalTitle || m.title;
        if (cleanHeadline(raw) === m.title) queue.push(m); // nunca tuvo reescritura real
      }
    }
    let rewritten = 0;
    for (let i = 0; i < queue.length; i += concurrency) {
      const batch = queue.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (news) => {
          news.titleAiTries = (news.titleAiTries || 0) + 1;
          const raw = news.originalTitle || news.title;
          const better = await this.paraphraseTitle(raw);
          if (better) {
            news.title = better;
            news.titleAi = true;
            rewritten++;
          } else if (raw !== news.title) {
            news.title = cleanHeadline(raw);
            news.titleAi = true;
          }
        }),
      );
    }
    if (queue.length > 0) await this.newsRepository.save(queue);
    if (rewritten > 0) this.logger.log(`Parafrasis IA: ${rewritten}/${queue.length} titulares reescritos`);
    return { attempted: queue.length, rewritten };
  }
}
