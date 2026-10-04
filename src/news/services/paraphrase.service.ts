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
    const primary = this.configService.get<string>('AI_MODEL', '') || '';
    const extra = (this.configService.get<string>('AI_MODEL_FALLBACK', '') || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    return {
      baseUrl: (this.configService.get<string>('AI_BASE_URL', '') || '').replace(/\/$/, ''),
      apiKey: this.configService.get<string>('AI_API_KEY', '') || '',
      models: [primary, ...extra].filter(Boolean),
      limit: this.configService.get<number>('AI_PARAPHRASE_LIMIT', 20) || 20,
      timeout: this.configService.get<number>('AI_TIMEOUT_MS', 45000) || 45000,
      concurrency: 4,
    };
  }

  /** Parafrasea UN titular. Retorna null si no se pudo (usar fallback). */
  async paraphraseTitle(rawTitle: string): Promise<string | null> {
    const { baseUrl, apiKey, models, timeout } = this.conf;
    if (!baseUrl || !apiKey || models.length === 0) {
      if (!this.warnedNoKey) {
        this.warnedNoKey = true;
        this.logger.warn('IA no configurada (AI_BASE_URL/AI_API_KEY/AI_MODEL): se omiten parafrasis');
      }
      return null;
    }
    for (const model of models) {
      try {
        const res = await axios.post(
          `${baseUrl}/chat/completions`,
          {
            model,
            temperature: 0.2,
            max_tokens: 80,
            // Los Nemotron de NVIDIA son modelos de razonamiento: sin esto filtran
            // su analisis a `content` y el titular sale inservible.
            chat_template_kwargs: { enable_thinking: false },
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
        const valid = this.validate(rawTitle, text);
        if (valid) return valid;
        this.logger.debug(`Paraphrase ${model} devolvio texto no valido`);
      } catch (e: any) {
        this.logger.debug(`Paraphrase fallo en ${model}: ${e.message}`);
      }
    }
    return null;
  }

  /** Parafrasea el contenido (summary) de una noticia. Retorna null si no se pudo. */
  async paraphraseContent(rawContent: string): Promise<string | null> {
    const { baseUrl, apiKey, models, timeout } = this.conf;
    if (!baseUrl || !apiKey || models.length === 0) return null;
    for (const model of models) {
      try {
        const res = await axios.post(
          `${baseUrl}/chat/completions`,
          {
            model,
            temperature: 0.3,
            max_tokens: 300,
            chat_template_kwargs: { enable_thinking: false },
            messages: [
              {
                role: 'system',
                content:
                  'Reescribe el contenido de esta noticia con tus propias palabras. Mantén toda la información factual, cifras, nombres y contexto. No añadas opinión ni información nueva. Máximo 200 palabras. Responde SOLO con el texto reescrito, sin comillas ni explicaciones.',
              },
              { role: 'user', content: rawContent },
            ],
          },
          {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout,
            responseType: 'text',
          },
        );
        const text = this.extractText(res.data, res.headers?.['content-type'] as string);
        const clean = text.replace(/^["'«“]+|["'»」]+$/g, '').replace(/\s+/g, ' ').trim();
        if (clean.length >= 30 && clean !== rawContent) return clean;
        this.logger.debug(`Content paraphrase ${model} devolvio texto no valido`);
      } catch (e: any) {
        this.logger.debug(`Content paraphrase fallo en ${model}: ${e.message}`);
      }
    }
    return null;
  }

  /** Genera un análisis editorial de la noticia usando IA. */
  async generateAnalysis(title: string, content: string): Promise<string | null> {
    const { baseUrl, apiKey, models, timeout } = this.conf;
    if (!baseUrl || !apiKey || models.length === 0) return null;
    for (const model of models) {
      try {
        const res = await axios.post(
          `${baseUrl}/chat/completions`,
          {
            model,
            temperature: 0.4,
            max_tokens: 250,
            chat_template_kwargs: { enable_thinking: false },
            messages: [
              {
                role: 'system',
                content:
                  'Eres un analista editorial. Analiza esta noticia en 3-4 párrafos: contexto, implicaciones, y perspectiva. Sé objetivo y profesional. No uses markdown ni listas. Responde SOLO con el análisis.',
              },
              { role: 'user', content: `Título: ${title}\n\nContenido: ${content}` },
            ],
          },
          {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout,
            responseType: 'text',
          },
        );
        const text = this.extractText(res.data, res.headers?.['content-type'] as string);
        const clean = text.replace(/\s+/g, ' ').trim();
        if (clean.length >= 50) return clean;
        this.logger.debug(`Analysis ${model} devolvio texto no valido`);
      } catch (e: any) {
        this.logger.debug(`Analysis fallo en ${model}: ${e.message}`);
      }
    }
    return null;
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

  /**
   * Acepta solo reescrituras reales y seguras; si no, null (fallback).
   *
   * Publicar un titular reescrito es asumir la responsabilidad editorial sobre
   * el texto, asi que ademas de la longitud hay que descartar los defectos que
   * el modelo produce de forma repetida: razonamiento filtrado, repetir
   * palabras o caracteres, y marcado de markdown.
   */
  private validate(original: string, candidate: string): string | null {
    if (!candidate) return null;
    let t = candidate.replace(/^["'«“]+|["'»”]+$/g, '').replace(/\s+/g, ' ').trim();
    if (t.length < 15 || t.length > 140) return null;
    const n = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();
    if (n(t) === n(original)) return null; // identico: no aporta
    if (/^(lo siento|no puedo|como ia|soy un)/i.test(t)) return null; // negativa del modelo
    if (ParaphraseService.META_PATTERN.test(t)) return null; // razonamiento o instrucciones
    if (ParaphraseService.MARKDOWN_PATTERN.test(t)) return null; // **, listas, ```
    if (ParaphraseService.DOUBLED_ACCENT.test(t)) return null; // "disparoóó"
    if (ParaphraseService.TRIPLED_LETTER.test(t)) return null; // "aaaa"
    if (ParaphraseService.DOUBLED_WORD.test(t)) return null; // "de de", "92 92"
    return t;
  }

  /**
   * Razonamiento del modelo o eco del prompt. `enable_thinking=false` cubre
   * la mayor parte, pero con el fallback entre modelos alguno se cuela.
   * Solo minusculas en las vocales acentuadas: una mayuscula nunca duplica.
   */
  private static readonly DOUBLED_ACCENT =
    /([áéíóúÁÉÍÓÚ])\1/;

  /** Tres o mas letras iguales seguidas. Solo minuscula: "XIII" es legitimo. */
  private static readonly TRIPLED_LETTER = /([a-záéíóúñ])\1{2,}/;

  /** Palabra repetida seguidos, incluida la numeracion: "92 92". */
  private static readonly DOUBLED_WORD = /\b(\w{2,})\s+\1\b/i;

  private static readonly META_PATTERN =
    /here'?s? (a )?thinking|let'?s? break|we need to|the user wants|i (will|need to|'ll) |as an ai|my task|rephrase (the|this)|thinking process|step \d+:|constraints?:|own words|reformul|reescrib|aquí (está|tiene) el titular|^\*\*|the provided (text|headline)|faithful to the (fact|headline)/i;

  private static readonly MARKDOWN_PATTERN = /```|^\s*[\[\*#]/;

  /**
   * Parafrasea representantes pendientes (titleAi=false) y reintenta los que
   * quedaron con version limpia (max 2 intentos). Tope por ciclo.
   * Tambien parafrasea el contenido (summary) si contentAi=false.
   */
  async paraphrasePending(): Promise<{ attempted: number; rewritten: number; contentRewritten: number }> {
    const { limit, concurrency } = this.conf;
    if (!this.conf.baseUrl || !this.conf.apiKey || this.conf.models.length === 0) {
      await this.paraphraseTitle('ping');
      return { attempted: 0, rewritten: 0, contentRewritten: 0 };
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
    let contentRewritten = 0;
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
          if (!news.contentAi && news.summary) {
            const contentBetter = await this.paraphraseContent(news.summary);
            if (contentBetter) {
              news.summary = contentBetter;
              news.contentAi = true;
              contentRewritten++;
            }
          }
          if (!news.aiAnalysis) {
            const analysis = await this.generateAnalysis(news.title, news.summary);
            if (analysis) {
              news.aiAnalysis = analysis;
            }
          }
        }),
      );
    }
    if (queue.length > 0) await this.newsRepository.save(queue);
    if (rewritten > 0) this.logger.log(`Parafrasis IA: ${rewritten}/${queue.length} titulares reescritos`);
    if (contentRewritten > 0) this.logger.log(`Contenido IA: ${contentRewritten}/${queue.length} contenidos reescritos`);
    return { attempted: queue.length, rewritten, contentRewritten };
  }
}
