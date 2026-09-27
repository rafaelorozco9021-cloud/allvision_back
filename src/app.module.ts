import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './config/app.config';
import { ScraperModule } from './scraper/scraper.module';
import { NewsModule } from './news/news.module';
import { RankingModule } from './ranking/ranking.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { LegalModule } from './legal/legal.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';

@Module({
  imports: [
    DatabaseModule,
    ScraperModule,
    NewsModule,
    RankingModule,
    SchedulerModule,
    WhatsappModule,
    LegalModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
