import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { NewsEntity } from '../entities/news.entity';
import { DeduplicationService } from './deduplication.service';
import { classifyCategory } from './category-classifier';
import { cleanHeadline } from '../../scraper/services/headline';

/**
 * Agrupa noticias de distintos medios que cubren la MISMA historia.
 * - Normaliza titulares (minusculas, sin tildes, sin coletilla del medio).
 * - Dos noticias son la misma historia si comparten >=3 terminos significativos
 *   (con solape Jaccard minimo) o son casi identicas (Jaro-Winkler), dentro
 *   de una ventana de 72h.
 * - Cada historia elige un representante (mayor viralScore) que es lo unico
 *   que se muestra en feed/trending, con sourceCount = medios distintos.
 */
@Injectable()
export class StoryClusterService {
  private readonly logger = new Logger(StoryClusterService.name);
  private readonly windowHours = 72;
  private readonly maxItems = 600;

  private readonly stopwords = new Set(
    'de la el en y a los las del se por con una para al como mas su son fue han hay esta este estos estas eso ese esa esos esas aqui alli donde cuando quien quienes cual cuales cuyo cuya cuyos cuyas mi tu su sus nos les me te lo le les un unos sobre entre tras hoy ayer manana ante bajo cabe sino aunque porque pues sino segun contra desde hasta hacia durante mediante vez veces tan tanto muy poco mucho todo todos toda todas cada otro otra otros otras mismo misma mismos mismas nuevo nueva nuevos nuevas gran grandes primer primera primeros primeras ultimo ultima pais nacional dice dicen asegura aseguran revela revelan cuenta esto esto'.split(' '),
  );

  private readonly outletNames = [
    'el tiempo', 'el heraldo', 'el espectador', 'zona cero',
    'semana', 'la patilla', 'el nacional', 'noticia al dia',
    'techcrunch', 'the verge', 'bbc news', 'bbc',
  ];

  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
    private readonly deduplicationService: DeduplicationService,
  ) {}

  normalize(title: string): string {
    let t = (title || '').toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const outlet of this.outletNames) {
      t = t.replace(new RegExp(`\\s*[-|–—:]\\s*${outlet}\\s*$`), '');
    }
    t = t.replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
  }

  significantTokens(normalized: string): string[] {
    const out: string[] = [];
    for (const w of normalized.split(' ')) {
      if (!w) continue;
      const isNum = /^\d+$/.test(w);
      if ((w.length >= 4 || isNum) && !this.stopwords.has(w) && !out.includes(w)) out.push(w);
    }
    return out;
  }

  sameStory(a: NewsEntity, normA: string, tokA: string[], b: NewsEntity, normB: string, tokB: string[]): boolean {
    if (a.id === b.id) return false;
    const hours = Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) / 3_600_000;
    if (hours > this.windowHours) return false;
    const setB = new Set(tokB);
    const shared = tokA.filter((t) => setB.has(t)).length;
    if (shared >= 3) {
      const union = new Set([...tokA, ...tokB]).size;
      if (union > 0 && shared / union >= 0.3) return true;
    }
    // Titulares casi identicos (misma nota republicada con otro titular leve)
    if (this.deduplicationService.isSimilar(normA, normB)) return true;
    return false;
  }

  async recluster(): Promise<{ clusters: number; multiSource: number; maxSources: number }> {
    const items = await this.newsRepository.find({
      where: { active: true },
      order: { publishedAt: 'DESC' },
      take: this.maxItems,
    });
    const norm = new Map<string, string>();
    const toks = new Map<string, string[]>();
    for (const n of items) {
      const nn = this.normalize(n.title);
      norm.set(n.id, nn);
      toks.set(n.id, this.significantTokens(nn));
      // Backfill de categoria para filas viejas o clasificadas como generales
      if (!n.category || n.category === 'generales') {
        n.category = classifyCategory({ title: n.title, summary: n.summary, url: n.canonicalUrl });
      }
      // Backfill de titular propio: conserva el original y limpia coletillas
      if (!n.originalTitle && n.title) {
        n.originalTitle = n.title;
        const cleaned = cleanHeadline(n.title);
        if (cleaned) n.title = cleaned;
      }
    }
    const clusters: { id: string; members: NewsEntity[] }[] = [];
    for (const item of items) {
      let placed = false;
      for (const c of clusters) {
        const rep = c.members[0];
        if (
          this.sameStory(
            item, norm.get(item.id)!, toks.get(item.id)!,
            rep, norm.get(rep.id)!, toks.get(rep.id)!,
          )
        ) {
          c.members.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ id: uuid(), members: [item] });
    }
    let multiSource = 0;
    let maxSources = 1;
    for (const c of clusters) {
      const sources = new Set(c.members.map((m) => m.source));
      const distinct = sources.size;
      if (distinct > 1) multiSource++;
      if (distinct > maxSources) maxSources = distinct;
      const rep = [...c.members].sort(
        (x, y) => y.viralScore - x.viralScore || x.publishedAt.getTime() - y.publishedAt.getTime(),
      )[0];
      for (const m of c.members) {
        m.clusterId = c.id;
        m.isRepresentative = m.id === rep.id;
        m.sourceCount = distinct;
      }
    }
    await this.newsRepository.save(items);
    this.logger.log(
      `Clustering: ${clusters.length} historias, ${multiSource} en 2+ medios (max ${maxSources}) sobre ${items.length} noticias`,
    );
    return { clusters: clusters.length, multiSource, maxSources };
  }
}
