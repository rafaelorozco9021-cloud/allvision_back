import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ScraperService } from '../../scraper/services/scraper.service';

@Injectable()
export class ScraperSchedulerService {
  private readonly logger = new Logger(ScraperSchedulerService.name);

  constructor(
    private readonly scraperService: ScraperService,
    private readonly configService: ConfigService,
  ) {}

  private running = false;

  @Interval(60000)
  async runScheduledScraping() {
    if (this.running) {
      this.logger.warn('Previous scraping still running, skipping cycle');
      return;
    }
    this.running = true;
    this.logger.log('Running scheduled scraping...');
    try {
      await this.scraperService.scrapeAll();
    } catch (error: any) {
      this.logger.error('Scheduled scraping failed', error.stack);
    } finally {
      this.running = false;
    }
  }
}
