import { Body, Controller, Get, Put } from '@nestjs/common';
import { BusinessService } from './business.service';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto';

@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  async get() {
    return this.businessService.get();
  }

  @Put()
  async upsert(@Body() dto: UpsertBusinessProfileDto) {
    return this.businessService.upsert(dto);
  }
}
