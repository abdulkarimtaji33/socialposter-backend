import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { Logo } from './logo.entity';
import { LogoController } from './logo.controller';
import { LogoService } from './logo.service';

@Module({
  imports: [TypeOrmModule.forFeature([Logo]), BusinessModule],
  controllers: [LogoController],
  providers: [LogoService],
})
export class LogoModule {}
