import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
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
  getAuthUrl(@Query('business') business: string) {
    if (!business) {
      throw new BadRequestException('Missing required "business" query param.');
    }
    return { url: this.linkedInService.getAuthUrl(business) };
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendOrigin = this.config.get<string>('FRONTEND_ORIGIN');
    try {
      await this.linkedInService.handleCallback(code, state);
      res.redirect(`${frontendOrigin}/business?linkedin=connected`);
    } catch {
      res.redirect(`${frontendOrigin}/business?linkedin=error`);
    }
  }

  @Get('status/:business')
  async status(@Param('business') business: string) {
    return this.linkedInService.getStatus(business);
  }

  @Delete('disconnect/:business')
  async disconnect(@Param('business') business: string) {
    await this.linkedInService.disconnect(business);
    return { success: true };
  }
}
