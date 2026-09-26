import {
  Controller,
  Post,
  Body,
  Get,
  Logger as NestLogger,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappBroadcastService } from './services/whatsapp-broadcast.service';
import { WhatsappSubscriber } from './whatsapp.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new NestLogger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly broadcastService: WhatsappBroadcastService,
  ) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to WhatsApp newsletter' })
  @ApiResponse({ status: 201, description: 'Subscriber added successfully' })
  async subscribe(
    @Body('phoneNumber') phoneNumber: string,
    @Body('email') email: string,
    @Body('name') name: string,
  ): Promise<WhatsappSubscriber> {
    return this.whatsappService.subscribe(phoneNumber, email, name, []);
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe from WhatsApp newsletter' })
  @ApiResponse({ status: 200, description: 'Subscriber removed successfully' })
  async unsubscribe(@Body('phoneNumber') phoneNumber: string): Promise<void> {
    await this.whatsappService.unsubscribe(phoneNumber);
  }

  @Get('subscribers')
  @ApiOperation({ summary: 'Get all subscribers' })
  @ApiResponse({ status: 200, description: 'List of subscribers' })
  async getSubscribers(): Promise<WhatsappSubscriber[]> {
    return this.whatsappService.getSubscribers();
  }

  @Post('send-news')
  @ApiOperation({ summary: 'Enviar noticia a un numero o a todos' })
  @ApiResponse({ status: 201, description: 'Resultado del envio' })
  async sendNews(
    @Body('title') title: string,
    @Body('summary') summary: string,
    @Body('link') link: string,
    @Body('imageUrl') imageUrl?: string,
    @Body('phoneNumber') phoneNumber?: string,
  ): Promise<{ success: number; failed: number; detail?: string }> {
    if (phoneNumber) {
      const sent = await this.whatsappService.sendNewsMessage(
        phoneNumber,
        title,
        summary,
        link,
        imageUrl,
      );
      return {
        success: sent ? 1 : 0,
        failed: sent ? 0 : 1,
        detail: sent ? 'Mensaje entregado a WhatsApp' : 'Evolution API rechazo el envio',
      };
    }
    return this.whatsappService.broadcastToSubscribers(title, summary, link, imageUrl);
  }

  @Post('broadcast/run')
  @ApiOperation({ summary: 'Disparar el ciclo de difusion ahora' })
  @ApiResponse({ status: 201, description: 'Ciclo ejecutado' })
  async runBroadcast() {
    await this.broadcastService.broadcastTrending();
    return { ok: true, message: 'Ciclo de difusion ejecutado' };
  }
}