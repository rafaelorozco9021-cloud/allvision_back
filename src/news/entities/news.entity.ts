import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { v4 as uuid } from 'uuid';

export interface NewsData {
  title: string;
  originalTitle?: string;
  summary: string;
  mainImage: string;
  images?: string[];
  url: string;
  source: string;
  sourceUrl?: string;
  category?: string;
  publishedAt: Date;
}

@Entity('news')
export class NewsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  canonicalUrl: string;

  @Column()
  title: string;

  /** Titular original del medio (transparencia editorial). */
  @Column({ type: 'text', nullable: true })
  originalTitle: string | null;

  /** True si el titular ya paso por parafrasis IA (o se fijo la version limpia). */
  @Column({ default: false })
  titleAi: boolean;

  /** Intentos de parafrasis IA (tope: no reintentar eternamente). */
  @Column({ type: 'int', default: 0 })
  titleAiTries: number;

  @Column('text')
  summary: string;

  @Column({ nullable: true })
  mainImage: string | null;

  @Column({ type: 'simple-json', nullable: true })
  images: string[] | null;

  @Column()
  url: string;

  @Column()
  source: string;

  @Column({ nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'timestamptz' })
  publishedAt: Date;

  @Column({ type: 'double precision', default: 0 })
  viralScore: number;

  /**
   * Cuantos medios DISTINTOS cubren esta historia. Lo escribe unicamente
   * `StoryClusterService.recluster()` al agrupar: es el unico sitio donde se
   * conoce el cluster completo.
   *
   * No se incrementa al re-raspar. Volver a ver la misma URL en el mismo feed
   * no es una fuente nueva, y hacerlo inflaba el numero sin limite: una nota
   * de El Espectador servida por el RSS de Google News durante dias llego a
   * marcar x14 y otra a x34 cuando solo tenia un medio.
   */
  @Column({ type: 'int', default: 1 })
  sourceCount: number;

  /** Historia a la que pertenece (agrupacion cross-medio). Null = aun sin agrupar. */
  @Index()
  @Column({ nullable: true })
  clusterId: string | null;

  /** Solo el representante de cada historia aparece en feed/trending. */
  @Column({ default: true })
  isRepresentative: boolean;

  /** Seccion tematica: politica, judiciales, sucesos, tecnologia, economia,
   *  deportes, opinion, mundo, salud, cultura, generales. */
  @Index()
  @Column({ default: 'generales' })
  category: string;

  @Column({ type: 'simple-json', nullable: true })
  socialMetrics: { shares?: number; likes?: number; comments?: number } | null;

  @Column({ default: true })
  active: boolean;

  /**
   * True si la fuente tiene prohibida la republicacion de fotos. No es
   * columna: se calcula en lectura con `isImageBlocked(this.source)` para que
   * la politica de `sources.config.ts` siga siendo la unica fuente de verdad
   * y el frontend pueda explicar por que no hay imagen.
   */
  imagesBlocked?: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @CreateDateColumn()
  updatedAt: Date;

  constructor(data?: Partial<NewsData>) {
    if (data) {
      this.id = uuid();
      this.canonicalUrl = data.url || '';
      this.title = data.title || '';
      this.originalTitle = data.originalTitle || data.title || null;
      this.summary = data.summary || '';
      this.mainImage = data.mainImage || '';
      this.images = data.images && data.images.length > 0 ? data.images.slice(0, 1) : null;
      this.url = data.url || '';
      this.source = data.source || '';
      this.sourceUrl = data.sourceUrl || null;
      this.category = data.category || 'generales';
      this.publishedAt = data.publishedAt || new Date();
      this.viralScore = 0;
    }
  }
}
