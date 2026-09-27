import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from '../news/entities/news.entity';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

@Module({
  imports: [TypeOrmModule.forFeature([NewsEntity])],
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
