import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertBusinessProfileDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  industry?: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetAudience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  uniqueSellingPoints?: string;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}
