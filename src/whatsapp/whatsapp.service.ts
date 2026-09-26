import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsappSubscriber } from './whatsapp.entity';
import { Repository } from 'typeorm';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;

  constructor(
    @InjectRepository(WhatsappSubscriber)
    private readonly subscriberRepository: Repository<WhatsappSubscriber>,
  ) {
    this.apiBaseUrl = process.env.EVOLUTION_API_URL || '';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
    this.instance = process.env.EVOLUTION_INSTANCE || '';
  }

  async subscribe(
    phoneNumber: string,
    email: string,
    name: string,
    categories: string[],
  ): Promise<WhatsappSubscriber> {
    const normalizedPhone = phoneNumber.startsWith('+')
      ? phoneNumber
      : `+${phoneNumber}`;

    const existing = await this.subscriberRepository.findOne({
      where: { phone_number: normalizedPhone },
    });

    if (existing) {
      existing.email = email;
      existing.name = name;
      existing.categories = categories.join(',');
      existing.opt_in = 1;
      existing.subscribed_at = new Date();
      return this.subscriberRepository.save(existing);
    }

    const subscriber = this.subscriberRepository.create({
      phone_number: normalizedPhone,
      email,
      name,
      categories: categories.join(','),
      opt_in: 1,
      subscribed_at: new Date(),
      last_message_sent: '',
    });

    return this.subscriberRepository.save(subscriber);
  }

  async unsubscribe(phoneNumber: string): Promise<void> {
    const normalizedPhone = phoneNumber.startsWith('+')
      ? phoneNumber
      : `+${phoneNumber}`;

    await this.subscriberRepository.delete({
      phone_number: normalizedPhone,
    });
  }

  async getSubscribers(): Promise<WhatsappSubscriber[]> {
    return this.subscriberRepository.find();
  }

  async sendText(
    phoneNumber: string,
    text: string,
  ): Promise<boolean> {
    const digits = phoneNumber.replace(/\D/g, '');
    const jid = digits.startsWith('57') ? digits : `57${digits}`;

    try {
      const url = `${this.apiBaseUrl}/message/sendText/${this.instance}`;
      const payload = { number: `${jid}@c.us`, text };

      const res = await axios.post(url, payload, {
        headers: { apikey: this.apiKey, 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      this.logger.log(`Texto enviado a ${jid}`);
      return Boolean(res.data?.key?.id || res.data?.status);
    } catch (error) {
      const detail = error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 200)
        : error.message;
      this.logger.error(`Fallo envio texto a ${jid}: ${detail}`);
      return false;
    }
  }

  async sendImage(
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<boolean> {
    const digits = phoneNumber.replace(/\D/g, '');
    const jid = digits.startsWith('57') ? digits : `57${digits}`;

    try {
      const url = `${this.apiBaseUrl}/message/sendMedia/${this.instance}`;
      const payload: Record<string, string> = {
        number: `${jid}@c.us`,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: caption || '',
      };
      if (/^https?:\/\//i.test(imageUrl)) {
        payload.url = imageUrl;
      } else {
        payload.basename = 'imagen';
        payload.file = imageUrl;
      }

      const res = await axios.post(url, payload, {
        headers: { apikey: this.apiKey, 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      this.logger.log(`Imagen enviada a ${jid}`);
      return Boolean(res.data?.key?.id || res.data?.status);
    } catch (error) {
      const detail = error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 200)
        : error.message;
      this.logger.error(`Fallo envio imagen a ${jid}: ${detail}`);
      return false;
    }
  }

  async sendNewsMessage(
    phoneNumber: string,
    title: string,
    summary: string,
    link: string,
    imageUrl?: string,
  ): Promise<boolean> {
    const caption =
      `*${title}*\n\n${summary}\n\nLeer mas en AllVision: ${link}`;

    let sent = false;
    if (imageUrl) {
      sent = await this.sendImage(phoneNumber, imageUrl, caption);
    }
    if (!sent) {
      sent = await this.sendText(phoneNumber, caption);
    }
    return sent;
  }

  async broadcastToSubscribers(
    title: string,
    summary: string,
    link: string,
    imageUrl?: string,
  ): Promise<{ success: number; failed: number }> {
    const allSubscribers = await this.getSubscribers();
    const subscribers = allSubscribers.filter((s) => s.opt_in === 1);

    const results = { success: 0, failed: 0 };

    for (const subscriber of subscribers) {
      const sent = await this.sendNewsMessage(
        subscriber.phone_number,
        title,
        summary,
        link,
        imageUrl,
      );
      if (sent) {
        results.success++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  /** Ids ya enviados a un suscriptor. */
  private sentIds(sub: WhatsappSubscriber): string[] {
    return (sub.sent_news_ids || '').split(',').filter(Boolean);
  }

  /**
   * Envia una noticia solo a los suscriptores que aun no la reciben.
   * Actualiza el registro de cada suscriptor para no repetir en el siguiente ciclo.
   */
  async sendNewsOnce(
    title: string,
    summary: string,
    link: string,
    newsId: string,
    imageUrl?: string,
  ): Promise<{ sent: number; skipped: number; failed: number }> {
    const result = { sent: 0, skipped: 0, failed: 0 };
    const subscribers = (await this.getSubscribers()).filter(
      (s) => s.opt_in === 1,
    );

    for (const sub of subscribers) {
      if (this.sentIds(sub).includes(newsId)) {
        result.skipped++;
        continue;
      }

      const ok = await this.sendNewsMessage(
        sub.phone_number,
        title,
        summary,
        link,
        imageUrl,
      );

      if (ok) {
        const updated = this.sentIds(sub);
        updated.push(newsId);
        sub.sent_news_ids = updated.slice(-200).join(',');
        sub.last_message_sent = title.slice(0, 90);
        sub.last_sent_at = new Date();
        await this.subscriberRepository.save(sub);
        result.sent++;
      } else {
        result.failed++;
      }
    }

    return result;
  }
}