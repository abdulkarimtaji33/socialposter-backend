import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PostsService } from '../posts/posts.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly postsService: PostsService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    const cronExpression =
      this.config.get<string>('DAILY_POST_CRON') ?? '0 8 * * *';

    const job = new CronJob(cronExpression, () => this.runDailyGeneration());
    this.schedulerRegistry.addCronJob('daily-post-generation', job);
    job.start();
    this.logger.log(`Daily post generation scheduled with "${cronExpression}"`);
  }

  private async runDailyGeneration() {
    try {
      const post = await this.postsService.generateDailyPost();
      this.logger.log(`Generated daily post #${post.id}`);
    } catch (error) {
      this.logger.error(`Daily post generation failed: ${error.message}`);
    }
  }
}
