import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScraperService } from '../services/scraper.service';
import { RunScraperDto } from '../dto/run-scraper.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Scraper')
@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('run')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  async run(@Body() dto: RunScraperDto) {
    const result = await this.scraperService.scrapeAll(dto.sourceName);
    return result;
  }
}
