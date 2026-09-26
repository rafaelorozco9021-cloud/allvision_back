import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsEntity } from '../../news/entities/news.entity';
import { ViralRankingService } from './viral-ranking.service';

@Injectable()
export class RankingService {
  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
    private readonly viralRankingService: ViralRankingService,
  ) {}

  async recalculateAll(): Promise<void> {
    const allNews = await this.newsRepository.find({ where: { active: true } });
    for (const news of allNews) {
      news.viralScore = this.viralRankingService.calculateScore(news);
      await this.newsRepository.save(news);
    }
  }
}
