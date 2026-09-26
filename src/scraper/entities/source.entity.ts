import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('sources')
export class SourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  domain: string;

  @Column({ unique: true })
  baseUrl: string;

  @Column()
  feedUrl: string;

  @Column({ type: 'int', default: 30 })
  frequencyMinutes: number;

  @Column({ type: 'simple-json', nullable: true })
  selectors: Record<string, string>;

  @Column({ default: true })
  rssEnabled: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column({ default: true })
  isScraping: boolean;
}
