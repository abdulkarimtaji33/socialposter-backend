import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { Repository } from 'typeorm';
import { BusinessProfile } from '../business/business-profile.entity';
import { BusinessService } from '../business/business.service';
import { LinkedInService } from '../linkedin/linkedin.service';
import { Post, PostStatus } from './post.entity';
import { UpdatePostDto } from './dto/update-post.dto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

interface GeneratedContent {
  imagePrompt: string;
  caption: string;
  hashtags: string[];
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Post)
    private readonly repo: Repository<Post>,
    private readonly businessService: BusinessService,
    private readonly linkedInService: LinkedInService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async findAll(): Promise<Post[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<Post> {
    const post = await this.repo.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException(`Post ${id} not found`);
    }
    return post;
  }

  async update(id: number, dto: UpdatePostDto): Promise<Post> {
    const post = await this.findOne(id);
    if (dto.caption !== undefined) {
      post.caption = dto.caption;
    }
    if (dto.hashtags !== undefined) {
      post.hashtags = dto.hashtags;
    }
    return this.repo.save(post);
  }

  async remove(id: number): Promise<void> {
    const post = await this.findOne(id);
    const filePath = path.join(process.cwd(), post.imageUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await this.repo.remove(post);
  }

  private static readonly PRODUCT_SPOTLIGHT_CHANCE = 0.25;

  private pickProductSpotlight(business: BusinessProfile): string | null {
    const products = (business.products ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (products.length === 0) {
      return null;
    }
    if (Math.random() >= PostsService.PRODUCT_SPOTLIGHT_CHANCE) {
      return null;
    }
    return products[Math.floor(Math.random() * products.length)];
  }

  private async generateContent(
    business: BusinessProfile,
  ): Promise<GeneratedContent> {
    const model =
      this.config.get<string>('OPENAI_MODEL') ?? 'gpt-5-mini';

    const spotlight = this.pickProductSpotlight(business);
    const spotlightInstruction = spotlight
      ? `\n\nFor today's post specifically, focus on promoting this product/tool instead of the business in general: ${spotlight}\nWrite the caption and image idea around this product, include a clear call to action, and mention it by name.`
      : '';

    const prompt = `You are a social media marketing expert writing a daily LinkedIn post for the following business.

Business name: ${business.name}
About the business: ${business.description}${spotlightInstruction}

Produce a single fresh marketing idea for today, structured around three parts: an attention-grabbing HOOK, short MAIN CONTENT (the value/idea), and a clear CTA (call to action). Both the image and the caption must use this same hook / main content / CTA structure so they reinforce each other.

The image itself must contain real, legible text laid out like a designed social media graphic (bold hook headline at the top, 1-2 short supporting lines in the middle as the main content, and a short CTA line/button near the bottom) — not just a plain photo. Describe the exact text to render, its placement, and a clean, on-brand visual background/design behind it.

Respond ONLY with strict JSON matching this shape, no markdown fences:
{
  "imagePrompt": "a detailed prompt for an image generation model describing a professional marketing graphic, with the exact hook headline text, main content text, and CTA text to render on the image, plus their placement/layout and the background/visual style behind them",
  "caption": "an engaging LinkedIn caption (120-220 words) written in the business's tone, clearly structured as: a strong hook as the first line, a short main content section expanding on the value/idea, and a clear CTA at the end, optimized for LinkedIn SEO and engagement, directly related to the image",
  "hashtags": ["5 to 8 relevant hashtags without the # symbol"]
}`;

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new BadRequestException('OpenAI did not return any content.');
    }

    let parsed: GeneratedContent;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Failed to parse OpenAI response as JSON.');
    }
    return parsed;
  }

  private async generateImage(imagePrompt: string): Promise<Buffer> {
    const model =
      this.config.get<string>('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1';
    const result = await this.openai.images.generate({
      model,
      prompt: imagePrompt,
      size: '1024x1024',
      n: 1,
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new BadRequestException('OpenAI did not return image data.');
    }
    return Buffer.from(b64, 'base64');
  }

  async generateDailyPost(): Promise<Post> {
    const business = await this.businessService.getOrThrow();
    const content = await this.generateContent(business);
    const imageBuffer = await this.generateImage(content.imagePrompt);

    const fileName = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), imageBuffer);

    const post = this.repo.create({
      imagePrompt: content.imagePrompt,
      imageUrl: `/uploads/${fileName}`,
      caption: content.caption,
      hashtags: (content.hashtags ?? []).map((h) => `#${h}`).join(' '),
      status: PostStatus.DRAFT,
    });
    const saved = await this.repo.save(post);

    const autoPublish =
      this.config.get<string>('AUTO_PUBLISH_ON_GENERATE') === 'true';
    if (autoPublish && business.autoPublish) {
      try {
        await this.publish(saved.id);
      } catch (error) {
        this.logger.warn(
          `Auto-publish failed for post ${saved.id}: ${error.message}`,
        );
      }
    }

    return this.findOne(saved.id);
  }

  async publish(id: number): Promise<Post> {
    const post = await this.findOne(id);
    if (post.status === PostStatus.PUBLISHED) {
      return post;
    }

    const filePath = path.join(process.cwd(), post.imageUrl.replace(/^\//, ''));
    const imageBuffer = fs.readFileSync(filePath);
    const text = `${post.caption}\n\n${post.hashtags ?? ''}`.trim();

    try {
      const linkedinPostId = await this.linkedInService.publishImagePost({
        text,
        imageBuffer,
      });
      post.status = PostStatus.PUBLISHED;
      post.linkedinPostId = linkedinPostId;
      post.publishedAt = new Date();
      post.errorMessage = null;
    } catch (error) {
      post.status = PostStatus.FAILED;
      post.errorMessage = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      await this.repo.save(post);
      throw error;
    }

    return this.repo.save(post);
  }
}
