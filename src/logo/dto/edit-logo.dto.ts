import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EditLogoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  instructions: string;
}
