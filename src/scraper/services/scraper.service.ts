import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SourceConfig } from '../../config/sources.config';
import { SummaryService } from './summary.service';
import { NewsService } from '../../news/services/news.service';
import { StoryClusterService } from '../../news/services/story-cluster.service';
import { ParaphraseService } from '../../news/services/paraphrase.service';
import RssParser from 'rss-parser';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';
import { NewsEntity } from '../../news/entities/news.entity';
import { classifyCategory } from '../../news/services/category-classifier';
import { cleanHeadline } from './headline';

const MAX_PHOTOS = 1; // Postura conservadora: una sola miniatura por noticia

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly parser = new RssParser({
    customFields: {
      item: [['media:content', 'mediaContent']],
    },
  });

  constructor(
    private readonly configService: ConfigService,
    private readonly summaryService: SummaryService,
    private readonly newsService: NewsService,
    private readonly storyClusterService: StoryClusterService,
    private readonly paraphraseService: ParaphraseService,
  ) {}

  async scrapeAll(forceSource?: string): Promise<{ scraped: number; errors: string[] }> {
    const results = { scraped: 0, errors: [] as string[] };
    const sources = this.getSources();
    for (const sourceConfig of sources) {
      if (forceSource && sourceConfig.name !== forceSource) continue;
      try {
        const newsItems = await this.scrapeSource(sourceConfig);
        const saved = await this.newsService.saveNewsBatch(newsItems);
        results.scraped += saved.length;
        this.logger.log(`Scraped ${saved.length} news from ${sourceConfig.name}`);
      } catch (error: any) {
        const msg = `Error scraping ${sourceConfig.name}: ${error.message}`;
        results.errors.push(msg);
        this.logger.error(msg);
      }
    }
    // Agrupar historias repetidas entre medios y reordenar por repeticion
    try {
      const stats = await this.storyClusterService.recluster();
      this.logger.log(
        `Feed ordenado por repeticion: ${stats.multiSource} historias en 2+ medios (max ${stats.maxSources})`,
      );
    } catch (error: any) {
      this.logger.warn(`Clustering omitido: ${error.message}`);
    }
    // Parafrasis IA de titulares representantes (con fallback automatico)
    try {
      await this.paraphraseService.paraphrasePending();
    } catch (error: any) {
      this.logger.warn(`Parafrasis omitida: ${error.message}`);
    }
    return results;
  }

  private async scrapeSource(config: SourceConfig): Promise<NewsEntity[]> {
    if (!(await this.isScrapingAllowed(config))) {
      this.logger.warn(`Omitido ${config.name}: robots.txt lo prohibe`);
      return [];
    }
    if (config.rssEnabled) {
      try {
        const rssItems = await this.parseRss(config);
        if (rssItems.length > 0) return rssItems;
      } catch (e: any) {
        this.logger.warn(`RSS failed for ${config.name}, falling back to HTML`, e.message);
      }
    }
    return this.scrapeHtml(config);
  }

  private readonly robotsCache = new Map<string, { allowed: boolean; at: number }>();

  /** Respeta robots.txt: omite la fuente si prohibe todo el sitio a nuestro bot o a todos. */
  private async isScrapingAllowed(config: SourceConfig): Promise<boolean> {
    const cached = this.robotsCache.get(config.baseUrl);
    if (cached && Date.now() - cached.at < 6 * 3_600_000) return cached.allowed;
    let allowed = true;
    try {
      const res = await axios.get(`${config.baseUrl}/robots.txt`, { timeout: 8000 });
      const lines = String(res.data).split('\n');
      let applies = false;
      for (const raw of lines) {
        const line = raw.split('#')[0].trim();
        const ua = line.match(/^user-agent:\s*(.+)$/i);
        if (ua) {
          const name = ua[1].trim().toLowerCase();
          applies = name === '*' || name.includes('allvision');
          continue;
        }
        const dis = line.match(/^disallow:\s*(.*)$/i);
        if (dis && applies && dis[1].trim() === '/') {
          allowed = false;
          break;
        }
      }
    } catch {
      // Sin robots.txt accesible no hay prohibicion expresa: se permite
      allowed = true;
    }
    this.robotsCache.set(config.baseUrl, { allowed, at: Date.now() });
    return allowed;
  }

  private async parseRss(config: SourceConfig): Promise<NewsEntity[]> {
    const feed = await this.parser.parseURL(config.feedUrl);
    if (!feed.items || feed.items.length === 0) return [];
    const maxItems = this.configService.get<number>('MAX_NEWS_PER_SCRAPE', 50);
    const userAgent = this.configService.get<string>('USER_AGENT', 'AllVisionBot/1.0');
    const timeout = this.configService.get<number>('REQUEST_TIMEOUT', 10000);
    const items: NewsEntity[] = [];
    for (const item of feed.items.slice(0, maxItems)) {
      const rawContent = item['content:encoded'] || item['content'] || item['content:summary'] || '';
      const summary = this.summaryService.generateSummary(
        sanitizeHtml(rawContent || item.title || '', { allowedTags: [] }) || item.title || '',
      );
      const seedImages = this.collectRssImages(item, rawContent);
      // Los links de Google News son redirects: se resuelven al enriquecer
      const isRedirect = (item.link || '').includes('news.google.com');
      const news = new NewsEntity({
        title: cleanHeadline(item.title),
        originalTitle: item.title,
        summary,
        mainImage: seedImages[0] || '',
        images: seedImages,
        url: item.link,
        source: config.name,
        sourceUrl: config.baseUrl,
        category: classifyCategory({
          title: item.title,
          summary,
          url: item.link,
          feedCategories: (item as any).categories,
        }),
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      });
      // Marcar para resolucion+enriquecimiento posterior
      (news as any)._needsEnrich = seedImages.length < MAX_PHOTOS || isRedirect;
      items.push(news);
    }
    await this.enrichWithArticleImages(items, userAgent, timeout);
    return items;
  }

  private async scrapeHtml(config: SourceConfig): Promise<NewsEntity[]> {
    const maxItems = this.configService.get<number>('MAX_NEWS_PER_SCRAPE', 50);
    const timeout = this.configService.get<number>('REQUEST_TIMEOUT', 10000);
    const rateLimitDelay = this.configService.get<number>('RATE_LIMIT_DELAY', 2000);
    const userAgent = this.configService.get<string>('USER_AGENT', 'AllVisionBot/1.0');
    const items: NewsEntity[] = [];

    try {
      const response = await axios.get(config.baseUrl, {
        headers: { 'User-Agent': userAgent },
        timeout,
      });
      const html = response.data as string;
      const $ = cheerio.load(html);
      const elements = $(config.selectors.list);
      elements.each((_, el) => {
        const $el = $(el);
        const link = this.pickArticleLink($, $el, config);
        let title = $el.find(config.selectors.title).first().text().trim();
        if (!title) {
          // Fallback: el ancla con el texto propio mas largo (titular sin "Lee mas")
          let best = '';
          $el.find('a').each((_, a) => {
            const t = $(a).clone().children().remove().end().text().trim().replace(/\s+/g, ' ');
            if (t.length > best.length && !/lee m[aá]s/i.test(t)) best = t;
          });
          title = best.length >= 25 ? best : $el.find('a').first().text().trim();
        }
        const image =
          $el.find(config.selectors.image).first().attr('src') ||
          $el.find(config.selectors.image).first().attr('data-src');
        const bodyText = $el
          .find(config.selectors.body)
          .map((_, e) => $(e).text())
          .get()
          .join(' ');
        if (!title || !link) return;
        const fullUrl = link.startsWith('http') ? link : `${config.baseUrl}${link}`;
        const summary = this.summaryService.generateSummary(bodyText || title);
        const absImg = image ? this.absolutizeUrl(image, config.baseUrl) : null;
        const seedImages: string[] = absImg ? [absImg] : [];
        const newsEntity = new NewsEntity({
          title: cleanHeadline(title),
          originalTitle: title,
          summary,
          mainImage: seedImages[0] || '',
          images: seedImages,
          url: fullUrl,
          source: config.name,
          sourceUrl: config.baseUrl,
          category: classifyCategory({ title, summary, url: fullUrl }),
          publishedAt: new Date(),
        });
        (newsEntity as any)._needsEnrich = true;
        items.push(newsEntity);
      });
    } catch (error: any) {
      this.logger.error(`HTTP scrape failed for ${config.name}: ${error.message}`);
    }

    await this.delay(rateLimitDelay);
    const sliced = items.slice(0, maxItems);
    await this.enrichWithArticleImages(sliced, userAgent, timeout);
    return sliced;
  }

  /** Imagenes declaradas en el RSS: enclosure, media:content e <img> del contenido. */
  private collectRssImages(item: any, rawContent: string): string[] {
    const found: string[] = [];
    const keys = new Set<string>();
    const push = (u?: string | null) => {
      if (!u) return;
      const clean = u.trim();
      if (!clean.startsWith('http')) return;
      const key = this.photoKey(clean);
      if (keys.has(key)) return;
      keys.add(key);
      found.push(clean);
    };
    push(item.enclosure?.url);
    const media = item.mediaContent;
    const mediaList = Array.isArray(media) ? media : media ? [media] : [];
    for (const m of mediaList) push(m?.$?.url || (typeof m === 'string' ? m : undefined));
    if (rawContent && rawContent.includes('<img')) {
      const $ = cheerio.load(rawContent);
      $('img').each((_, el) => {
        if (found.length >= MAX_PHOTOS) return;
        push($(el).attr('src'));
      });
    }
    return found.slice(0, MAX_PHOTOS);
  }

  /**
   * Completa hasta 3 fotos por noticia visitando la pagina del articulo.
   * Tambien resuelve URLs de redirect (Google News) a la URL final.
   */
  private async enrichWithArticleImages(items: NewsEntity[], userAgent: string, timeout: number): Promise<void> {
    const limit = this.configService.get<number>('IMAGE_ENRICH_LIMIT', 20);
    const concurrency = this.configService.get<number>('IMAGE_CONCURRENCY', 5);
    const fetchTimeout = this.configService.get<number>('IMAGE_FETCH_TIMEOUT', 8000);
    const queue = items.filter((i) => (i as any)._needsEnrich).slice(0, limit);
    for (let i = 0; i < queue.length; i += concurrency) {
      const batch = queue.slice(i, i + concurrency);
      await Promise.all(batch.map((news) => this.enrichOne(news, userAgent, fetchTimeout)));
    }
    for (const news of items) {
      delete (news as any)._needsEnrich;
      if (news.images && news.images.length > 0 && !news.mainImage) {
        news.mainImage = news.images[0];
      }
    }
  }

  private async enrichOne(news: NewsEntity, userAgent: string, timeout: number): Promise<void> {
    try {
      const response = await axios.get(news.url, {
        headers: { 'User-Agent': userAgent },
        timeout,
        maxRedirects: 5,
      });
      const finalUrl = (response.request?.res?.responseUrl as string) || news.url;
      if (finalUrl && finalUrl !== news.url) {
        news.url = finalUrl;
        news.canonicalUrl = finalUrl;
      }
      const $ = cheerio.load(response.data as string);
      const seeds = [...(news.images || [])];
      const keys = new Set<string>(seeds.map((s) => this.photoKey(s)));
      const push = (u?: string | null) => {
        if (!u || seeds.length >= MAX_PHOTOS) return;
        const abs = this.absolutizeUrl(u.trim(), finalUrl);
        if (!abs || !this.isContentImage(abs)) return;
        const key = this.photoKey(abs);
        if (keys.has(key)) return;
        keys.add(key);
        seeds.push(abs);
      };
      push($('meta[property="og:image"]').attr('content'));
      push($('meta[name="twitter:image"]').attr('content'));
      $('article img, main img, figure img, .nota img, .article img').each((_, el) => {
        if (seeds.length >= MAX_PHOTOS) return;
        push($(el).attr('src') || $(el).attr('data-src'));
      });
      if (seeds.length > 0) {
        news.images = seeds.slice(0, MAX_PHOTOS);
        if (!news.mainImage) news.mainImage = news.images[0];
      }
    } catch (e: any) {
      this.logger.debug(`Image enrich failed for ${news.url}: ${e.message}`);
    }
  }

  private photoKey(url: string): string {
    return url.split('?')[0].split('#')[0].toLowerCase();
  }

  private absolutizeUrl(url: string, base: string): string | null {
    try {
      if (!url || url.startsWith('data:')) return null;
      return new URL(url, base).toString();
    } catch {
      return null;
    }
  }

  private isContentImage(url: string): boolean {
    const lower = url.toLowerCase();
    if (lower.endsWith('.svg')) return false;
    if (/logo|icon|avatar|sprite|favicon|placeholder|pixel|1x1|blank|loading/.test(lower)) return false;
    if (/\/plugins\/|\/assets\/src\/|popover|emoji|sharethis|newsletter|widget/.test(lower)) return false;
    return true;
  }

  /** Elige el link del articulo dentro de una tarjeta: prefiere URLs del propio dominio (la mas larga). */
  private pickArticleLink($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>, config: SourceConfig): string | undefined {
    const hrefs: string[] = [];
    $el.find('a[href]').each((_, a) => {
      const h = $(a).attr('href');
      if (h) hrefs.push(h);
    });
    if (hrefs.length === 0) return $el.find(config.selectors.link).first().attr('href');
    const absolute = hrefs.map((h) => (h.startsWith('http') ? h : `${config.baseUrl}${h}`));
    const own = absolute.filter((h) => h.includes(config.domain));
    const pool = own.length > 0 ? own : absolute;
    // Excluir anclas/secciones obvias que no son articulos
    const candidates = pool.filter((h) => !/#|\/tag\/|\/autor\/|premium|suscribete|newsletters/i.test(h));
    const list = candidates.length > 0 ? candidates : pool;
    return list.sort((a, b) => b.length - a.length)[0];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getSources(): SourceConfig[] {
    return [
      { name: 'El Tiempo', domain: 'https://www.eltiempo.com', baseUrl: 'https://www.eltiempo.com', feedUrl: 'https://www.eltiempo.com/rss/colombia.xml', frequencyMinutes: 30, selectors: { list: 'article', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: true },
      { name: 'El Heraldo', domain: 'https://www.elheraldo.co', baseUrl: 'https://www.elheraldo.co', feedUrl: 'https://www.elheraldo.co/arc/outboundfeeds/rss/', frequencyMinutes: 30, selectors: { list: '.featured-story-card', title: 'h1, h2, h3, h4', link: 'a.ingl-link', image: 'img', body: 'p' }, rssEnabled: true },
      { name: 'El Espectador', domain: 'elespectador.com', baseUrl: 'https://www.elespectador.com', feedUrl: 'https://news.google.com/rss/search?q=site:elespectador.com&hl=es-419&gl=CO&ceid=CO:es-419', frequencyMinutes: 30, selectors: { list: '.Card-HomeEE', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: false },
      { name: 'Zona Cero', domain: 'zonacero.com', baseUrl: 'https://zonacero.com', feedUrl: 'https://zonacero.com/rss.xml', frequencyMinutes: 30, selectors: { list: '.view-ultimas-noticas-home .views-row', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: false },
      { name: 'Semana', domain: 'https://www.semana.com', baseUrl: 'https://www.semana.com', feedUrl: 'https://www.semana.com/arc/outboundfeeds/rss/', frequencyMinutes: 30, selectors: { list: 'article', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: true },
      { name: 'La Patilla', domain: 'lapatilla.com', baseUrl: 'https://lapatilla.com', feedUrl: 'https://lapatilla.com/feed', frequencyMinutes: 30, selectors: { list: 'article', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: false },
      { name: 'El Nacional', domain: 'https://www.elnacional.com', baseUrl: 'https://www.elnacional.com', feedUrl: 'https://www.elnacional.com/feed', frequencyMinutes: 30, selectors: { list: 'article', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: true },
      { name: 'Noticia al Dia', domain: 'noticialdia.com', baseUrl: 'https://noticialdia.com', feedUrl: 'https://noticialdia.com/feed', frequencyMinutes: 30, selectors: { list: 'article', title: 'h2, h3', link: 'a', image: 'img', body: 'p' }, rssEnabled: true },
    ];
  }
}
