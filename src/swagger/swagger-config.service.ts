import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export async function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('AllVision API')
    .setDescription('News Aggregator API with viral ranking')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
