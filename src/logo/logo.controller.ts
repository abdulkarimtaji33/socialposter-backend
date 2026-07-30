import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EditLogoDto } from './dto/edit-logo.dto';
import { GenerateLogoDto } from './dto/generate-logo.dto';
import { LogoService } from './logo.service';

@Controller('logo')
export class LogoController {
  constructor(private readonly logoService: LogoService) {}

  @Get()
  async findAllForBusiness(@Query('business') business: string) {
    return this.logoService.findAllForBusiness(business);
  }

  @Post('generate')
  async generate(@Query('business') business: string, @Body() dto: GenerateLogoDto) {
    return this.logoService.generate(business, dto.brief);
  }

  @Post(':id/edit')
  async edit(@Param('id', ParseIntPipe) id: number, @Body() dto: EditLogoDto) {
    return this.logoService.edit(id, dto.instructions);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.logoService.remove(id);
    return { success: true };
  }
}
