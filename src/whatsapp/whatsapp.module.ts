import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappSubscriber } from './whatsapp.entity';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappBroadcastService } from './services/whatsapp-broadcast.service';
import { NewsEntity } from '../news/entities/news.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappSubscriber, NewsEntity])],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappBroadcastService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
