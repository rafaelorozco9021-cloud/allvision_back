import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { setupSwagger } from './swagger/swagger-config.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  if (process.env.SWAGGER_ENABLED !== 'false') {
    await setupSwagger(app);
  }

  logger.log(`AllVision backend running on http://localhost:${port}`);
}
bootstrap();
