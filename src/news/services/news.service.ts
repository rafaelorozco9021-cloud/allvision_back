import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NewsEntity } from '../../news/entities/news.entity';
import { NewsData } from '../../news/entities/news.entity';
import { isImageBlocked } from '../../config/sources.config';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
  ) {}

  async findAll(
    limit: number,
    page: number,
    source?: string,
    category?: string,
  ): Promise<{ news: NewsEntity[]; total: number }> {
    const query = this.newsRepository.createQueryBuilder('news')
      .where('news.active = :active', { active: true })
      .andWhere('news.isRepresentative = :rep', { rep: true })
      .orderBy('news.sourceCount', 'DESC')
      .addOrderBy('news.viralScore', 'DESC')
      // Desempate obligatorio. Con viralScore en 0 para todas las notas el
      // ORDER BY no ordenaba nada, y Postgres devuelve los empates en el
      // orden que le sale: la misma nota caia en la pagina 1 y en la 2, y el
      // feed la mostraba duplicada. publishedAt da el criterio util (lo mas
      // reciente primero) e id, que es unico, cierra la fila.
      .addOrderBy('news.publishedAt', 'DESC')
      .addOrderBy('news.id', 'ASC');

    if (source) {
      query.andWhere('news.source = :source', { source });
    }

    if (category && category !== 'generales') {
      if (category === 'judiciales') {
        // Criterio editorial: judiciales incluye sucesos
        query.andWhere('news.category IN (:...cats)', { cats: ['judiciales', 'sucesos'] });
      } else {
        query.andWhere('news.category = :category', { category });
      }
    }

    query.skip(page * limit).take(limit);
    const [news, total] = await query.getManyAndCount();
    return { news: news.map((n) => this.withImagePolicy(n)), total };
  }

  /**
   * Anota si la foto fue retirada por politica. Se hace al leer y no como
   * columna para que cambiar `sources.config.ts` surta efecto de inmediato.
   */
  private withImagePolicy(news: NewsEntity): NewsEntity {
    news.imagesBlocked = isImageBlocked(news.source);
    return news;
  }

  async findById(id: string): Promise<NewsEntity | null> {
    const found = await this.newsRepository.findOne({ where: { id, active: true } });
    return found ? this.withImagePolicy(found) : null;
  }

  /** Medios que cubren la misma historia (cluster), ordenados por fecha. */
  async getCoverage(id: string): Promise<
    Array<{ id: string; title: string; source: string; sourceUrl: string | null; url: string; publishedAt: Date }>
  > {
    const item = await this.newsRepository.findOne({ where: { id, active: true } });
    if (!item || !item.clusterId) return [];
    const members = await this.newsRepository.find({
      where: { clusterId: item.clusterId, active: true },
      order: { publishedAt: 'ASC' },
    });
    return members.map((m) => ({
      id: m.id,
      title: m.title,
      source: m.source,
      sourceUrl: m.sourceUrl,
      url: m.url,
      publishedAt: m.publishedAt,
    }));
  }

  async findTrending(limit: number = 10): Promise<NewsEntity[]> {
    return this.newsRepository.find({
      where: { active: true, isRepresentative: true },
      // Mismo desempate que findAll: viralScore en 0 no ordenaba nada.
      order: { sourceCount: 'DESC', viralScore: 'DESC', publishedAt: 'DESC', id: 'ASC' },
      take: limit,
    }).then((rows) => rows.map((n) => this.withImagePolicy(n)));
  }

  async saveNewsBatch(newsItems: NewsEntity[]): Promise<NewsEntity[]> {
    const saved: NewsEntity[] = [];
    for (const item of newsItems) {
      if (isImageBlocked(item.source)) this.stripImages(item);
      const existing = await this.newsRepository.findOne({
        where: { canonicalUrl: item.canonicalUrl },
      });
      if (existing) {
        existing.sourceCount += 1;
        if (!existing.sourceUrl && item.sourceUrl) existing.sourceUrl = item.sourceUrl;
        if (isImageBlocked(existing.source)) {
          // Fuente bloqueada: el merge no debe resucitar una foto previa.
          this.stripImages(existing);
        } else {
          // Higiene de fotos: fusiona nuevas + existentes, elimina duplicadas,
          // placeholders e iconos de UI (p.ej. popover/plugins) y conserva max 3
          const merged = this.mergeImages(item.images, existing.images);
          if (JSON.stringify(merged) !== JSON.stringify(existing.images || [])) {
            existing.images = merged.length > 0 ? merged : existing.images;
            if (merged.length > 0) existing.mainImage = merged[0];
          }
        }
        await this.newsRepository.save(existing);
        saved.push(existing);
      } else {
        const savedItem = await this.newsRepository.save(item);
        saved.push(savedItem);
      }
    }
    return saved;
  }

  /** Vacia la fotografia de una nota (opcion A: sin imagen). */
  private stripImages(news: NewsEntity): void {
    news.mainImage = '';
    news.images = null;
  }

  async saveIfNew(item: NewsEntity): Promise<NewsEntity> {
    if (isImageBlocked(item.source)) this.stripImages(item);
    const existing = await this.newsRepository.findOne({
      where: { canonicalUrl: item.canonicalUrl },
    });
    if (existing) {
      existing.sourceCount += 1;
      if (!existing.sourceUrl && item.sourceUrl) existing.sourceUrl = item.sourceUrl;
      if (isImageBlocked(existing.source)) {
        this.stripImages(existing);
      } else {
        const merged = this.mergeImages(item.images, existing.images);
        if (merged.length > 0 && JSON.stringify(merged) !== JSON.stringify(existing.images || [])) {
          existing.images = merged;
          existing.mainImage = merged[0];
        }
      }
      return this.newsRepository.save(existing);
    }
    return this.newsRepository.save(item);
  }

  /** Fusiona listas de fotos: quita duplicadas (ignorando query params),
   *  descarta placeholders/iconos de UI y limita a 3. */
  private mergeImages(fresh?: string[] | null, stored?: string[] | null): string[] {
    const junk = /logo|icon|avatar|sprite|favicon|placeholder|pixel|1x1|blank|loading|\/plugins\/|\/assets\/src\/|popover|emoji|sharethis|newsletter|widget|\.svg(\?|$)/i;
    const out: string[] = [];
    const keys = new Set<string>();
    for (const u of [...(fresh || []), ...(stored || [])]) {
      if (!u || typeof u !== 'string' || junk.test(u)) continue;
      const key = u.split('?')[0].split('#')[0].toLowerCase();
      if (keys.has(key)) continue;
      keys.add(key);
      out.push(u);
      if (out.length >= 1) break;
    }
    return out;
  }

  async recalculateAllScores(): Promise<void> {
    const allNews = await this.newsRepository.find({ where: { active: true } });
    for (const news of allNews) {
      news.viralScore = this.calculateViralScore(news);
      await this.newsRepository.save(news);
    }
  }

  calculateViralScore(news: NewsEntity): number {
    const recencyWeight = 0.30;
    const positionWeight = 0.25;
    const multisourceWeight = 0.25;
    const socialWeight = 0.20;

    const now = new Date();
    const hoursOld = (now.getTime() - news.publishedAt.getTime()) / (1000 * 60 * 60);
    let recencyScore = Math.max(0, 100 - hoursOld * (100 / 24));
    recencyScore = Math.min(100, recencyScore);

    const positionScore = news.sourceCount > 1 ? 80 : news.sourceCount === 1 ? 40 : 0;
    const multisourceScore = Math.min(100, news.sourceCount * 25);
    const socialScore = news.socialMetrics
      ? Math.min(100, (news.socialMetrics.shares || 0) * 0.5 + (news.socialMetrics.likes || 0) * 0.3)
      : 0;

    return Math.round(
      recencyScore * recencyWeight +
      positionScore * positionWeight +
      multisourceScore * multisourceWeight +
      socialScore * socialWeight,
    );
  }
}
