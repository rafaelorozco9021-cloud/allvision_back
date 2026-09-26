import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] || request.query.apiKey;
    const expectedKey = this.configService.get<string>('API_KEY');
    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
