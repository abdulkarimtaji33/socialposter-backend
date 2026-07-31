import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const CRON_PATTERN = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

export class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  products?: string;

  @IsOptional()
  @IsString()
  metaPromptTemplate?: string;

  @IsOptional()
  @IsString()
  linkedinPromptTemplate?: string;

  @IsOptional()
  @IsString()
  productPostPromptTemplate?: string;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;

  @IsOptional()
  @IsBoolean()
  autoScheduleEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(CRON_PATTERN, {
    message: 'scheduleCron must be a 5-field cron expression, e.g. "0 20 * * *"',
  })
  scheduleCron?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  scheduleTimezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  schedulePlatforms?: string;
}
