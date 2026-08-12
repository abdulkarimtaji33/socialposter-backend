import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateFromPhotoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  brief: string;
}
