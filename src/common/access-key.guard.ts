import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const PUBLIC_PATHS = ['/api/linkedin/callback'];

@Injectable()
export class AccessKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredKey = this.config.get<string>('APP_ACCESS_KEY');
    if (!requiredKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (PUBLIC_PATHS.includes(request.path)) {
      return true;
    }

    const providedKey = request.header('x-access-key');
    if (providedKey !== requiredKey) {
      throw new UnauthorizedException('Invalid or missing access key.');
    }
    return true;
  }
}
