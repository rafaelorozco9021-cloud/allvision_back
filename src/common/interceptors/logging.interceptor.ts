import { NestMiddleware } from '@nestjs/common';
import { Logger } from '@nestjs/common';

export class LoggingInterceptor implements NestMiddleware {
  private readonly logger = new Logger('LoggingInterceptor');

  use(req: any, res: any, next: Function) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.log(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
  }
}
