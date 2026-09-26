import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NewsService } from '../services/news.service';
import { NewsQueryDto } from '../dto/news-query.dto';

@ApiTags('News')
@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
  ) {}

  @Get()
  async findAll(@Query() dto: NewsQueryDto) {
    const { news, total } = await this.newsService.findAll(dto.limit, dto.page, dto.source, dto.category);
    const totalPages = Math.ceil(total / dto.limit);
    return { news, total, page: dto.page, limit: dto.limit, totalPages };
  }

  @Get('trending')
  async trending(@Query('limit') limit?: string) {
    const parsed = limit !== undefined ? parseInt(limit, 10) : 10;
    const trending = await this.newsService.findTrending(Number.isNaN(parsed) ? 10 : parsed);
    return { trending };
  }

  @Get(':id/coverage')
  async coverage(@Param('id') id: string) {
    const coverage = await this.newsService.getCoverage(id);
    return { coverage };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const news = await this.newsService.findById(id);
    if (!news) throw new Error('News not found');
    return news;
  }
}
