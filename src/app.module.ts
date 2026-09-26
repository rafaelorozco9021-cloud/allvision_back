import { Module } from '@nestjs/common';
import { DatabaseModule } from './config/app.config';
import { ScraperModule } from './scraper/scraper.module';
import { NewsModule } from './news/news.module';
import { RankingModule } from './ranking/ranking.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    DatabaseModule,
    ScraperModule,
    NewsModule,
    RankingModule,
    SchedulerModule,
    WhatsappModule,
  ],
})
export class AppModule {}
