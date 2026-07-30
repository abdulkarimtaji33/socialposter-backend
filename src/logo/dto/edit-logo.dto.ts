import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EditLogoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  instructions: string;
}
