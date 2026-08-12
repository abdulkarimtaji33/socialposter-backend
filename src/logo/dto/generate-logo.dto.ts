import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateLogoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  brief?: string;
}
