import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../config/app.config';
import { ScraperModule } from '../scraper/scraper.module';
import { ScraperSchedulerService } from './services/scraper-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, ScraperModule],
  providers: [ScraperSchedulerService],
})
export class SchedulerModule {}
