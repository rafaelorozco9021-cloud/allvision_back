import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../decorators/public.decorator';

/**
 * Default-deny: toda ruta exige X-API-Key salvo las marcadas con @Public().
 * Registrado como APP_GUARD, asi un endpoint nuevo nace protegido.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] || request.query.apiKey;
    const expectedKey = this.configService.get<string>('API_KEY');

    // Sin API_KEY configurada no hay contra que comparar: se rechaza todo.
    if (!expectedKey) {
      throw new UnauthorizedException('API_KEY no esta configurada en el servidor');
    }

    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
