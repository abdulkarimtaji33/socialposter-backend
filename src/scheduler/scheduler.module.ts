import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PostsModule } from '../posts/posts.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), PostsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
