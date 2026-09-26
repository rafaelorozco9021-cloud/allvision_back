import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceEntity } from './entities/source.entity';
import { ScraperService } from './services/scraper.service';
import { ScraperController } from './controllers/scraper.controller';
import { SummaryService } from './services/summary.service';
import { NewsModule } from '../news/news.module';
import { DatabaseModule } from '../config/app.config';

@Module({
  imports: [TypeOrmModule.forFeature([SourceEntity]), NewsModule, DatabaseModule],
  providers: [ScraperService, SummaryService],
  controllers: [ScraperController],
  exports: [ScraperService, SummaryService],
})
export class ScraperModule {}
