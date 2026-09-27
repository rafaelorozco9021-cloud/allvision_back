import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { LegalService } from './legal.service';
import { TakedownRequestDto } from './dto/takedown-request.dto';

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  /** Politica de contenido y de imagenes. Publica, para que sea auditable. */
  @Get()
  @Public()
  policy() {
    return this.legalService.policy();
  }

  /**
   * Retiro de contenido a pedido de un medio o titular de derechos.
   * Publico a proposito: un medio no tiene por que tener una API key.
   */
  @Post('takedown')
  @Public()
  async takedown(@Body() dto: TakedownRequestDto) {
    return this.legalService.requestTakedown(dto);
  }
}
