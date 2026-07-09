import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AccessKeyGuard } from './common/access-key.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3200',
    allowedHeaders: ['Content-Type', 'x-access-key'],
  });
  app.useGlobalGuards(new AccessKeyGuard(app.get(ConfigService)));
  await app.listen(process.env.PORT ?? 4200);
}
bootstrap();
