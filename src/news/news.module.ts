import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from './entities/news.entity';
import { NewsService } from './services/news.service';
import { NewsController } from './controllers/news.controller';
import { ViralRankingService } from '../ranking/services/viral-ranking.service';
import { DeduplicationService } from './services/deduplication.service';
import { StoryClusterService } from './services/story-cluster.service';
import { ParaphraseService } from './services/paraphrase.service';

@Module({
  imports: [TypeOrmModule.forFeature([NewsEntity])],
  providers: [NewsService, ViralRankingService, DeduplicationService, StoryClusterService, ParaphraseService],
  controllers: [NewsController],
  exports: [NewsService, ViralRankingService, DeduplicationService, StoryClusterService, ParaphraseService],
})
export class NewsModule {}
