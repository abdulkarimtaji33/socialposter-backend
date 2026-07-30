import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import OpenAI, { toFile } from 'openai';
import * as path from 'path';
import { Repository } from 'typeorm';
import { BusinessService } from '../business/business.service';
import { Logo } from './logo.entity';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function describeError(error: unknown): string {
  const err = error as { response?: { data?: unknown }; message?: string };
  return err.response?.data
    ? JSON.stringify(err.response.data)
    : (err.message ?? String(error));
}

@Injectable()
export class LogoService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Logo)
    private readonly repo: Repository<Logo>,
    private readonly businessService: BusinessService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async findAllForBusiness(businessSlug: string): Promise<Logo[]> {
    const business = await this.businessService.getBySlugOrThrow(businessSlug);
    return this.repo.find({
      where: { businessId: business.id },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Logo> {
    const logo = await this.repo.findOne({ where: { id } });
    if (!logo) {
      throw new NotFoundException(`Logo ${id} not found`);
    }
    return logo;
  }

  private buildPrompt(businessName: string, businessDescription: string, brief?: string): string {
    return `Design a clean, professional, modern logo for a business called "${businessName}".

About the business: ${businessDescription}
${brief ? `\nSpecific direction for this logo: ${brief}` : ''}

Requirements: a simple, memorable, vector-style mark (icon and/or wordmark) suitable for use as a company logo. Flat design, no photographic elements, no drop shadows or gradients unless tasteful and minimal. Centered on a plain white or transparent-looking background so it can be cropped easily. The business name should be legible if included as a wordmark. Avoid clichés like generic globe icons or stock lightbulbs unless truly relevant. The logo should feel distinct to this specific business, not generic.`;
  }

  async generate(businessSlug: string, brief?: string): Promise<Logo> {
    const business = await this.businessService.getBySlugOrThrow(businessSlug);
    const model = this.config.get<string>('OPENAI_IMAGE_MODEL') ?? 'gpt-image-2';
    const prompt = this.buildPrompt(business.name, business.description, brief);

    const result = await this.openai.images
      .generate({
        model,
        prompt,
        size: '1024x1024',
        n: 1,
      })
      .catch((error) => {
        throw new BadRequestException(`Logo generation failed: ${describeError(error)}`);
      });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new BadRequestException('OpenAI did not return logo image data.');
    }

    const fileName = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(b64, 'base64'));

    const logo = this.repo.create({
      businessId: business.id,
      prompt,
      imageUrl: `/uploads/${fileName}`,
      parentLogoId: null,
    });
    return this.repo.save(logo);
  }

  async edit(logoId: number, instructions: string): Promise<Logo> {
    const parent = await this.findOne(logoId);
    const model = this.config.get<string>('OPENAI_IMAGE_MODEL') ?? 'gpt-image-2';

    const filePath = path.join(process.cwd(), parent.imageUrl.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Source logo image file no longer exists on disk.');
    }
    const imageFile = await toFile(fs.createReadStream(filePath), 'logo.png', {
      type: 'image/png',
    });

    const result = await this.openai.images
      .edit({
        model,
        image: imageFile,
        prompt: `Edit this logo as follows: ${instructions}\n\nKeep the overall style, composition, and brand identity consistent with the original unless the instructions say otherwise. Keep it a clean, professional logo suitable for business use.`,
      })
      .catch((error) => {
        throw new BadRequestException(`Logo edit failed: ${describeError(error)}`);
      });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new BadRequestException('OpenAI did not return edited logo image data.');
    }

    const fileName = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(b64, 'base64'));

    const logo = this.repo.create({
      businessId: parent.businessId,
      prompt: `${parent.prompt}\n\n[Edit: ${instructions}]`,
      imageUrl: `/uploads/${fileName}`,
      parentLogoId: parent.id,
    });
    return this.repo.save(logo);
  }

  async remove(id: number): Promise<void> {
    const logo = await this.findOne(id);
    const filePath = path.join(process.cwd(), logo.imageUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await this.repo.remove(logo);
  }
}
