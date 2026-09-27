import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsEntity } from '../news/entities/news.entity';
import { TakedownRequestDto } from './dto/takedown-request.dto';

/**
 * Canal de retirada de contenido para medios y titulares de derechos.
 *
 * AllVision es un agregador: guarda el titular, un fragmento breve del
 * `description` del feed, un enlace al original y, solo para fuentes sin
 * restriccion, la fotografia. Cuando un medio pide retirar una nota, se
 * desactiva localmente y se deja constancia del reclamo.
 */
@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);

  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
  ) {}

  /** Politica publicada: la que se lee en /legal. */
  policy() {
    return {
      site: 'allvision.space',
      nature:
        'Agregador de noticias. No hospedamos el articulo original: cada nota enlaza a la fuente y se muestra un fragmento breve del campo description que el medio publica en su feed para redistribucion.',
      contentShown: [
        'Titular (puede estar reescrito por IA; se conserva el titular original en el detalle)',
        'Fragmento breve del campo description del feed, con enlace al medio',
        'Fotografia del medio, solo para fuentes que no tienen restriccion de imagen',
      ],
      notShown: [
        'El cuerpo completo del articulo',
        'Articulos de pago o con marca de suscripcion',
      ],
      imagesPolicy:
        'No se publican fotografias de fuentes marcadas como noImages en la configuracion (El Tiempo, El Heraldo, El Espectador, Semana). En esas notas se muestra solo el titular, el fragmento y el enlace. Las imagenes de las demas fuentes se enlazan desde el CDN del medio con atribucion visible.',
      aiPolicy:
        'Los titulares pueden estar reescritos por un modelo de lenguaje. Cuando ocurre, se conserva el titular original y se indica en el detalle. AllVision no edita el contenido de los medios, solo el titular.',
      compliance:
        'Respetamos robots.txt de cada sitio y nos identificamos con un User-Agent que incluye correo de contacto.',
      takedown: {
        endpoint: 'POST /legal/takedown',
        requiredFields: ['originalUrl', 'claimant', 'reason', 'contactEmail'],
        responseTime: 'Se revisa en menos de 48 horas habiles.',
        note: 'Enviar la URL del articulo original basta para identificar la nota.',
      },
      contact: process.env.PUBLIC_CONTACT_EMAIL || 'contact@allvision.space',
    };
  }

  /**
   * Registra el reclamo y desactiva la nota mientras se revisa.
   * Devuelve la URL original para que el medio verifique que es la correcta.
   */
  async requestTakedown(dto: TakedownRequestDto) {
    const news = await this.findByUrl(dto.newsUrl || dto.originalUrl);
    if (!news) {
      throw new NotFoundException(
        'No encontramos una nota con esa URL. Envia la URL del articulo original (no la de AllVision).',
      );
    }

    news.active = false;
    await this.newsRepository.save(news);

    this.logger.warn(
      `TAKEDOWN: "${dto.claimant}" retiro "${news.url}" - ${dto.reason.slice(0, 120)}`,
    );

    return {
      status: 'received',
      retractedFromFeed: true,
      news: {
        id: news.id,
        title: news.originalTitle || news.title,
        originalUrl: news.url,
        source: news.source,
        removedAt: new Date().toISOString(),
      },
      message:
        'La nota fue retirada del feed. Si cree que es un error, responda a este correo con la URL del articulo.',
    };
  }

  private async findByUrl(url: string): Promise<NewsEntity | null> {
    const clean = url.trim();
    return (
      (await this.newsRepository.findOne({ where: { canonicalUrl: clean } })) ||
      (await this.newsRepository.findOne({ where: { url: clean } }))
    );
  }
}
