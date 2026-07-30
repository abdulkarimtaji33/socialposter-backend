import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateLogoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brief?: string;
}
