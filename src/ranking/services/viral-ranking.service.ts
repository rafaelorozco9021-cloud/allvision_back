import { Injectable } from '@nestjs/common';
import { NewsEntity } from '../../news/entities/news.entity';

@Injectable()
export class ViralRankingService {
  calculateScore(news: NewsEntity): number {
    const now = new Date();
    const hoursOld = (now.getTime() - news.publishedAt.getTime()) / (1000 * 60 * 60);

    const recencyScore = Math.max(0, 100 - hoursOld * (100 / 48));
    const positionScore = news.sourceCount > 1 ? 80 : 40;
    const multisourceScore = Math.min(100, news.sourceCount * 25);
    const socialScore = news.socialMetrics
      ? Math.min(100, ((news.socialMetrics.shares || 0) * 0.5 + (news.socialMetrics.likes || 0) * 0.3))
      : 0;

    const viralScore =
      recencyScore * 0.30 +
      positionScore * 0.25 +
      multisourceScore * 0.25 +
      socialScore * 0.20;

    return Math.round(Math.min(100, Math.max(0, viralScore)));
  }
}
