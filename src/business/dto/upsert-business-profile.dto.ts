import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertBusinessProfileDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  products?: string;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}
