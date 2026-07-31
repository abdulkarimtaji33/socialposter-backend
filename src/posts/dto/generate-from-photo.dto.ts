import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateFromPhotoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  brief: string;
}
