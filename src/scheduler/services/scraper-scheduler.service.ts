import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ScraperService } from '../../scraper/services/scraper.service';

const TIMER = 'scraper-scheduled';

@Injectable()
export class ScraperSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScraperSchedulerService.name);
  private running = false;

  constructor(
    private readonly scraperService: ScraperService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const minutes = Number(this.configService.get('SCRAPER_INTERVAL_MINUTES', 60));
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
    const intervalMs = safeMinutes * 60 * 1000;

    const timer = setInterval(() => this.runScheduledScraping(), intervalMs);
    this.schedulerRegistry.addInterval(TIMER, timer);

    this.logger.log(
      `Scraping programado cada ${safeMinutes} min (SCRAPER_INTERVAL_MINUTES)`,
    );

    // Primer ciclo al arrancar: si no, tras un redeploy el sitio queda vacio
    // hasta que pasan los primeros safeMinutes.
    this.runScheduledScraping();
  }

  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('interval', TIMER)) {
      this.schedulerRegistry.deleteInterval(TIMER);
    }
  }

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
