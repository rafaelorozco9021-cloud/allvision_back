import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScraperService } from '../services/scraper.service';
import { RunScraperDto } from '../dto/run-scraper.dto';

@ApiTags('Scraper')
@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('run')
  @ApiBearerAuth()
  async run(@Body() dto: RunScraperDto) {
    const result = await this.scraperService.scrapeAll(dto.sourceName);
    return result;
  }
}
