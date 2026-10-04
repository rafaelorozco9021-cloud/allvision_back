import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsEntity } from '../../news/entities/news.entity';
import { WhatsappService } from '../whatsapp.service';

const EVERY_MINUTES = Number(
  process.env.WHATSAPP_BROADCAST_EVERY_MINUTES || 1200,
);
const EVERY_MS = EVERY_MINUTES * 60 * 1000;
const PER_CYCLE = Number(process.env.WHATSAPP_BROADCAST_PER_CYCLE || 3);
const MAX_AGE_HOURS = Number(
  process.env.WHATSAPP_BROADCAST_MAX_AGE_HOURS || 6,
);
const BASE_URL = process.env.PUBLIC_URL || 'https://allvision.space';

@Injectable()
export class WhatsappBroadcastService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappBroadcastService.name);
  private running = false;

  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
    private readonly whatsappService: WhatsappService,
  ) {}

  async onModuleInit() {
    const all = await this.whatsappService.getSubscribers();
    const activos = all.filter((s) => s.opt_in === 1).length;

    this.logger.log(
      `Difusion WhatsApp activa: cada ${EVERY_MINUTES} min | ${PER_CYCLE} noticias/ciclo | ventana ${MAX_AGE_HOURS}h | ${activos} suscriptores`,
    );

    // Si un numero no se puede normalizar, el envio va a fallar en cada
    // ciclo y la base no lo registra (solo guarda los exitos). Avisamos aqui.
    const malos = this.whatsappService.unusableSubscribers(all);
    if (malos.length > 0) {
      this.logger.error(
        `${malos.length} suscriptor(es) con numero no utilizable, nunca recibiran noticias: ` +
          malos.map((s) => `${s.name || 'sin nombre'} <${s.phone_number}>`).join(', '),
      );
    }
  }

  @Interval(EVERY_MS)
  async broadcastTrending() {
    if (this.running) {
      this.logger.warn('Ciclo de difusion anterior aun en curso, se omite');
      return;
    }
    this.running = true;

    try {
      const since = new Date(
        Date.now() - MAX_AGE_HOURS * 3600 * 1000,
      );

      const candidates = await this.newsRepository
        .createQueryBuilder('n')
        .where('n.isRepresentative = :rep', { rep: true })
        .andWhere('n.active = :active', { active: true })
        .andWhere('n.publishedAt > :since', { since: since.toISOString() })
        .orderBy('n.sourceCount', 'DESC')
        .addOrderBy('n.viralScore', 'DESC')
        .addOrderBy('n.publishedAt', 'DESC')
        .take(PER_CYCLE)
        .getMany();

      if (candidates.length === 0) {
        this.logger.log('Sin noticias nuevas para difundir');
        return;
      }

      for (const news of candidates) {
        const image =
          news.mainImage ||
          (news.images && news.images.length ? news.images[0] : undefined);

        const res = await this.whatsappService.sendNewsOnce(
          news.title,
          (news.summary || '').slice(0, 240),
          `${BASE_URL}/news/${news.id}`,
          news.id,
          image || undefined,
        );

        this.logger.log(
          `"${news.title.slice(0, 45)}" -> enviados:${res.sent} omitidos:${res.skipped} fallidos:${res.failed}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Fallo la difusion WhatsApp: ${error.message}`);
    } finally {
      this.running = false;
    }
  }
}
