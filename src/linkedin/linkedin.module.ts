import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { LinkedInAccount } from './linkedin-account.entity';
import { LinkedInController } from './linkedin.controller';
import { LinkedInService } from './linkedin.service';

@Module({
  imports: [TypeOrmModule.forFeature([LinkedInAccount]), BusinessModule],
  controllers: [LinkedInController],
  providers: [LinkedInService],
  exports: [LinkedInService],
})
export class LinkedInModule {}
