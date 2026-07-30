import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { BusinessProfile } from '../business/business-profile.entity';
import { BusinessService } from '../business/business.service';
import { LinkedInService } from '../linkedin/linkedin.service';
import { MetaService } from '../meta/meta.service';
import { PostPlatform } from '../posts/post.entity';
import { PostsService } from '../posts/posts.service';

const ALL_PLATFORMS = [
  PostPlatform.LINKEDIN,
  PostPlatform.FACEBOOK,
  PostPlatform.INSTAGRAM,
];
const JOB_PREFIX = 'business-schedule-';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly postsService: PostsService,
    private readonly businessService: BusinessService,
    private readonly linkedInService: LinkedInService,
    private readonly metaService: MetaService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    // Preserve the original single global LinkedIn cron for backward compatibility
    // with the legacy single-business flow (AUTO_PUBLISH_ON_GENERATE / DAILY_POST_CRON).
    const legacyCronExpression =
      this.config.get<string>('DAILY_POST_CRON') ?? '0 8 * * *';
    const legacyJob = new CronJob(legacyCronExpression, () =>
      this.runLegacyLinkedInDailyGeneration(),
    );
    this.schedulerRegistry.addCronJob('daily-post-generation', legacyJob);
    legacyJob.start();
    this.logger.log(
      `Legacy daily post generation scheduled with "${legacyCronExpression}" (server timezone)`,
    );

    await this.refreshAllSchedules();
  }

  /** Re-reads every business's schedule config and (re)registers its cron job. */
  async refreshAllSchedules(): Promise<void> {
    const businesses = await this.businessService.findAll();
    for (const business of businesses) {
      this.refreshScheduleFor(business);
    }
  }

  /** Registers/replaces/removes the cron job for one business based on its current config. */
  refreshScheduleFor(business: BusinessProfile): void {
    const jobName = `${JOB_PREFIX}${business.slug}`;
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }

    if (!business.autoScheduleEnabled || !business.scheduleCron) {
      return;
    }

    let job: CronJob;
    try {
      job = new CronJob(
        business.scheduleCron,
        () => this.runScheduledGeneration(business.slug),
        null,
        false,
        business.scheduleTimezone || 'Asia/Dubai',
      );
    } catch (error) {
      this.logger.error(
        `Invalid schedule cron "${business.scheduleCron}" for "${business.slug}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
    this.logger.log(
      `Auto-schedule active for "${business.slug}": "${business.scheduleCron}" (${business.scheduleTimezone || 'Asia/Dubai'})`,
    );
  }

  private async runLegacyLinkedInDailyGeneration() {
    try {
      const post = await this.postsService.generateDailyPost();
      this.logger.log(`Generated daily LinkedIn post #${post.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Legacy daily post generation failed: ${message}`);
    }
  }

  private parseSchedulePlatforms(raw: string): PostPlatform[] {
    const requested = raw
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is PostPlatform => ALL_PLATFORMS.includes(p as PostPlatform));
    return requested.length ? requested : ALL_PLATFORMS;
  }

  /** Determines which requested platforms actually have a usable account for this business. */
  private async resolveReadyPlatforms(
    business: BusinessProfile,
    requested: PostPlatform[],
  ): Promise<PostPlatform[]> {
    const ready: PostPlatform[] = [];
    for (const platform of requested) {
      if (platform === PostPlatform.LINKEDIN) {
        if (await this.linkedInService.isConnected(business.id)) {
          ready.push(platform);
        }
      } else if (this.metaService.isConfigured(business.slug)) {
        ready.push(platform);
      }
    }
    return ready;
  }

  private async runScheduledGeneration(businessSlug: string) {
    const business = await this.businessService.findBySlug(businessSlug);
    if (!business) {
      this.logger.warn(`Scheduled run skipped: business "${businessSlug}" not found.`);
      return;
    }

    const requested = this.parseSchedulePlatforms(business.schedulePlatforms);
    const ready = await this.resolveReadyPlatforms(business, requested);
    if (ready.length === 0) {
      this.logger.warn(
        `Scheduled run for "${businessSlug}" skipped: none of [${requested.join(', ')}] have a connected/configured account.`,
      );
      return;
    }

    const platformsToRun: PostPlatform[] = [];
    for (const platform of ready) {
      try {
        const alreadyPosted = await this.postsService.hasPostedToday(
          business.id,
          platform,
        );
        if (alreadyPosted) {
          this.logger.log(
            `Skipping ${platform} for "${businessSlug}", already posted today.`,
          );
          continue;
        }
        platformsToRun.push(platform);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Idempotency check failed for "${businessSlug}"/${platform}: ${message}`,
        );
      }
    }

    if (platformsToRun.length === 0) {
      return;
    }

    try {
      const posts = await this.postsService.generateAndPublishForBusiness(
        businessSlug,
        platformsToRun,
      );
      for (const post of posts) {
        for (const publication of post.publications) {
          this.logger.log(
            `"${businessSlug}" ${publication.platform} post #${post.id} -> ${publication.status}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scheduled generation failed for "${businessSlug}": ${message}`);
    }
  }
}
