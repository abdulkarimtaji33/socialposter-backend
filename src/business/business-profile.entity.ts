import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('business_profiles')
export class BusinessProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  products: string | null;

  /**
   * Optional custom prompt template for Facebook/Instagram caption generation.
   * Supports placeholders: {businessName}, {businessDescription}, {angle},
   * {visualDescription}, {spotlightInstruction}, {recentCaptionsBlock}.
   * Falls back to the built-in default prompt when empty.
   */
  @Column({ type: 'text', nullable: true })
  metaPromptTemplate: string | null;

  /**
   * Optional custom prompt template for LinkedIn post generation.
   * Supports placeholders: {businessName}, {businessDescription}, {spotlightInstruction}.
   * Falls back to the built-in default prompt when empty.
   */
  @Column({ type: 'text', nullable: true })
  linkedinPromptTemplate: string | null;

  @Column({ default: false })
  autoPublish: boolean;

  /** Whether the per-business auto-schedule cron job is active. */
  @Column({ default: false })
  autoScheduleEnabled: boolean;

  /**
   * Standard 5-field cron expression (minute hour day month weekday), evaluated
   * in `scheduleTimezone`. E.g. "0 20 * * *" = every day at 20:00.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  scheduleCron: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Asia/Dubai' })
  scheduleTimezone: string;

  /**
   * Comma-separated platforms to auto-publish to when the schedule fires,
   * e.g. "facebook,instagram" or "linkedin,facebook,instagram". Platforms
   * without a connected/configured account are skipped automatically.
   */
  @Column({ type: 'varchar', length: 100, default: 'facebook,instagram' })
  schedulePlatforms: string;

  @Column({ type: 'datetime', nullable: true })
  lastPostedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
