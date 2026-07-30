import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { SchedulerService } from '../scheduler/scheduler.service';
import { BusinessService } from './business.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto';

@Controller('business')
export class BusinessController {
  constructor(
    private readonly businessService: BusinessService,
    private readonly schedulerService: SchedulerService,
  ) {}

  @Get('all')
  async findAll() {
    return this.businessService.findAll();
  }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.businessService.findBySlug(slug);
  }

  @Patch(':slug')
  async updateBySlug(
    @Param('slug') slug: string,
    @Body() dto: UpdateBusinessProfileDto,
  ) {
    const updated = await this.businessService.upsertBySlug(slug, dto);
    this.schedulerService.refreshScheduleFor(updated);
    return updated;
  }

  @Get()
  async get() {
    return this.businessService.get();
  }

  @Put()
  async upsert(@Body() dto: UpsertBusinessProfileDto) {
    const updated = await this.businessService.upsert(dto);
    this.schedulerService.refreshScheduleFor(updated);
    return updated;
  }
}
