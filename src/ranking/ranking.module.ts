import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from '../news/entities/news.entity';
import { RankingService } from './services/ranking.service';
import { ViralRankingService } from './services/viral-ranking.service';

@Module({
  imports: [TypeOrmModule.forFeature([NewsEntity])],
  providers: [RankingService, ViralRankingService],
  exports: [RankingService],
})
export class RankingModule {}
