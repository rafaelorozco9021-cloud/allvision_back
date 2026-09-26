import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('whatsapp_subscribers')
export class WhatsappSubscriber {
  @PrimaryColumn()
  phone_number: string;

  @Column({ default: '' })
  email: string;

  @Column({ default: '' })
  name: string;

  @Column({ type: 'text', default: '' })
  categories: string;

  @Column({ default: 1 })
  opt_in: number;

  @Column()
  subscribed_at: Date;

  @Column({ default: '' })
  last_message_sent: string;

  /** Ids de noticias ya enviadas, para no repetir. */
  @Column({ type: 'text', default: '' })
  sent_news_ids: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_sent_at: Date | null;
}