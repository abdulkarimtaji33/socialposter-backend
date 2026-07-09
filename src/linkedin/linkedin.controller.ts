import { Controller, Delete, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { LinkedInService } from './linkedin.service';

@Controller('linkedin')
export class LinkedInController {
  constructor(
    private readonly linkedInService: LinkedInService,
    private readonly config: ConfigService,
  ) {}

  @Get('auth-url')
  getAuthUrl() {
    return { url: this.linkedInService.getAuthUrl() };
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    await this.linkedInService.handleCallback(code);
    const frontendOrigin = this.config.get<string>('FRONTEND_ORIGIN');
    res.redirect(`${frontendOrigin}?linkedin=connected`);
  }

  @Get('status')
  async status() {
    return this.linkedInService.getStatus();
  }

  @Delete('disconnect')
  async disconnect() {
    await this.linkedInService.disconnect();
    return { success: true };
  }
}
