import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BusinessModule } from '../business/business.module';
import { LinkedInModule } from '../linkedin/linkedin.module';
import { MetaModule } from '../meta/meta.module';
import { PostsModule } from '../posts/posts.module';
import { SchedulerService } from './scheduler.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), PostsModule, BusinessModule, LinkedInModule, MetaModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
