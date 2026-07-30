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
import { Between, Repository } from 'typeorm';
import { BusinessProfile } from '../business/business-profile.entity';
import { BusinessService } from '../business/business.service';
import { LinkedInService } from '../linkedin/linkedin.service';
import { MetaService } from '../meta/meta.service';
import { PostPublication, PublicationStatus } from './post-publication.entity';
import { Post, PostPlatform } from './post.entity';
import { UpdatePostDto } from './dto/update-post.dto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const NO_DASH_INSTRUCTION =
  'Never use em dashes (—) or double dashes (--) anywhere in the caption or image text; use a period, comma, or "and" instead.';

interface GeneratedContent {
  imagePrompt: string;
  caption: string;
  hashtags: string[];
}

function describeError(error: unknown): string {
  const err = error as { response?: { data?: unknown }; message?: string };
  return err.response?.data
    ? JSON.stringify(err.response.data)
    : (err.message ?? String(error));
}

function stripBannedDashes(text: string): string {
  return text.replace(/--+/g, ',').replace(/[–—]/g, ',');
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Post)
    private readonly repo: Repository<Post>,
    @InjectRepository(PostPublication)
    private readonly publicationRepo: Repository<PostPublication>,
    private readonly businessService: BusinessService,
    private readonly linkedInService: LinkedInService,
    private readonly metaService: MetaService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async findAll(filter?: {
    businessSlug?: string;
    platform?: PostPlatform;
  }): Promise<Post[]> {
    const where: { businessId?: number; platform?: PostPlatform } = {};
    if (filter?.businessSlug) {
      const business = await this.businessService.findBySlug(filter.businessSlug);
      if (!business) {
        return [];
      }
      where.businessId = business.id;
    }

    if (filter?.platform) {
      const posts = await this.repo.find({ where, order: { createdAt: 'DESC' } });
      return posts.filter((p) =>
        p.publications.some((pub) => pub.platform === filter.platform),
      );
    }

    return this.repo.find({ where, order: { createdAt: 'DESC' } });
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
    await this.repo.save(post);
    return this.findOne(id);
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

  private async findRecentCaptions(
    businessId: number,
    limit = 6,
  ): Promise<string[]> {
    const posts = await this.repo.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return posts.map((p) => p.caption);
  }

  private static readonly META_CONTENT_ANGLES = [
    'a specific product or piece of inventory, described vividly, with no stats or numbers at all',
    'a relatable customer scenario or "who this is for" moment, told like a mini story',
    'a fun either/or or this-vs-that question that has nothing to do with sales metrics',
    'a behind-the-scenes or "did you know" style fact about the business or its craft',
    'a bold opinion or hot take related to the business niche, meant to spark comments',
    'a pure vibe/mood post built entirely around the visual, minimal explaining',
  ];

  private pickContentAngle(): string {
    const angles = PostsService.META_CONTENT_ANGLES;
    return angles[Math.floor(Math.random() * angles.length)];
  }

  private static readonly DEFAULT_LINKEDIN_PROMPT_TEMPLATE = `You are a social media marketing expert writing a daily LinkedIn post for the following business.

Business name: {businessName}
About the business: {businessDescription}{spotlightInstruction}

Produce a single fresh marketing idea for today, structured around three parts: an attention-grabbing HOOK, short MAIN CONTENT (the value/idea), and a clear CTA (call to action). Both the image and the caption must use this same hook / main content / CTA structure so they reinforce each other.

The image itself must contain real, legible text laid out like a designed social media graphic (bold hook headline at the top, 1-2 short supporting lines in the middle as the main content, and a short CTA line/button near the bottom), not just a plain photo. Describe the exact text to render, its placement, and a clean, on-brand visual background/design behind it.

Respond ONLY with strict JSON matching this shape, no markdown fences:
{
  "imagePrompt": "a detailed prompt for an image generation model describing a professional marketing graphic, with the exact hook headline text, main content text, and CTA text to render on the image, plus their placement/layout and the background/visual style behind them",
  "caption": "an engaging LinkedIn caption (120-220 words) written for the business, clearly structured as: a strong hook as the first line, a short main content section expanding on the value/idea, and a clear CTA at the end, optimized for LinkedIn SEO and engagement, directly related to the image",
  "hashtags": ["5 to 8 relevant hashtags without the # symbol"]
}`;

  private async generateContent(
    business: BusinessProfile,
  ): Promise<GeneratedContent> {
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-5-mini';

    const spotlight = this.pickProductSpotlight(business);
    const spotlightInstruction = spotlight
      ? `\n\nFor today's post specifically, focus on promoting this product/tool instead of the business in general: ${spotlight}\nWrite the caption and image idea around this product, include a clear call to action, and mention it by name.`
      : '';

    const template =
      business.linkedinPromptTemplate?.trim() ||
      PostsService.DEFAULT_LINKEDIN_PROMPT_TEMPLATE;

    const prompt =
      template
        .replaceAll('{businessName}', business.name)
        .replaceAll('{businessDescription}', business.description)
        .replaceAll('{spotlightInstruction}', spotlightInstruction) +
      `\n\n${NO_DASH_INSTRUCTION}`;

    return this.callOpenAiForContent(model, prompt);
  }

  private static readonly META_VISUALS: Record<string, string> = {
    zenzicly:
      'an elegant flat-lay of sparkling gemstones and crystal jewelry, optionally with a gaming accessory, on a premium dark purple/indigo background with gold and teal accent lighting, modern and premium feel',
    cgagames:
      'a dynamic composition of gaming consoles/controllers (PS5, Xbox, Switch) with neon purple/red lighting, high-energy gaming aesthetic, photorealistic, high detail, dark background',
    cybollic:
      'a modern tech/software aesthetic: abstract flowing data lines, subtle circuit or network node patterns, a laptop or dashboard UI mockup showing charts/automation, deep navy and electric blue gradient background, clean corporate-tech feel, no gaming consoles or gaming imagery of any kind',
  };

  private static readonly META_VISUAL_FALLBACK =
    'a clean, on-brand product or lifestyle scene that visually represents what this business actually sells or does, avoiding generic stock-photo cliches';

  private static readonly DEFAULT_META_PROMPT_TEMPLATE = `You're the social media manager for {businessName}. About the business: {businessDescription}

You're genuinely good at this job: witty, specific, a little irreverent, and you write like a person talking to people, never like a press release. You know your audience scrolls fast, so every post earns its place with a real hook, not a template.

Today, write an Instagram/Facebook caption built around {angle}. Let that angle actually shape the whole post, don't just bolt a generic company pitch onto it. Skip corporate phrases like "ROI," "proven track record," or repeating client stats; if a number genuinely fits today's angle, fine, but it should never be the point of the post. End on a CTA that a real person would actually respond to, tied specifically to what you just wrote about, not a generic "comment below."

Keep it under 120 words, and include 3-5 hashtags that fit.{spotlightInstruction}{recentCaptionsBlock}

Respond ONLY with strict JSON matching this shape, no markdown fences:
{
  "imagePrompt": "Generate a vibrant, eye-catching square (1:1) social media image for {businessName}. {visualDescription}. Overlay bold, clean white sans-serif text near the top that reads the same hook line used as the caption's first line (or a short derivative of it), make sure the text is sharp, legible, and well contrasted against the background.",
  "caption": "the caption you just wrote, following today's angle, ending in a real CTA, hashtags inline",
  "hashtags": ["3 to 5 relevant hashtags without the # symbol"]
}`;

  private async generateMetaContent(
    business: BusinessProfile,
  ): Promise<GeneratedContent> {
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-5-mini';

    const spotlight = this.pickProductSpotlight(business);
    const spotlightInstruction = spotlight
      ? `\n\nFor today's post specifically, focus on promoting this product/tool instead of the business in general: ${spotlight}\nWrite the caption and image idea around this product, include a clear call to action, and mention it by name.`
      : '';

    const recentCaptions = business.id
      ? await this.findRecentCaptions(business.id)
      : [];
    const recentCaptionsBlock = recentCaptions.length
      ? `\n\nHere's what you posted recently, for context on what NOT to repeat (find a fresh way in today):\n${recentCaptions.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

    const angle = this.pickContentAngle();
    const visualDescription =
      PostsService.META_VISUALS[business.slug] ?? PostsService.META_VISUAL_FALLBACK;

    const template =
      business.metaPromptTemplate?.trim() ||
      PostsService.DEFAULT_META_PROMPT_TEMPLATE;

    const prompt =
      template
        .replaceAll('{businessName}', business.name)
        .replaceAll('{businessDescription}', business.description)
        .replaceAll('{angle}', angle)
        .replaceAll('{visualDescription}', visualDescription)
        .replaceAll('{spotlightInstruction}', spotlightInstruction)
        .replaceAll('{recentCaptionsBlock}', recentCaptionsBlock) +
      `\n\n${NO_DASH_INSTRUCTION}`;

    return this.callOpenAiForContent(model, prompt);
  }

  private async callOpenAiForContent(
    model: string,
    prompt: string,
  ): Promise<GeneratedContent> {
    const completion = await this.openai.chat.completions
      .create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      })
      .catch((error) => {
        throw new BadRequestException(
          `OpenAI request failed: ${describeError(error)}`,
        );
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

    parsed.caption = stripBannedDashes(parsed.caption ?? '');
    parsed.imagePrompt = stripBannedDashes(parsed.imagePrompt ?? '');
    parsed.hashtags = (parsed.hashtags ?? []).map((h) => stripBannedDashes(h));
    return parsed;
  }

  private async generateImage(imagePrompt: string): Promise<Buffer> {
    const model =
      this.config.get<string>('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1';
    const result = await this.openai.images
      .generate({
        model,
        prompt: imagePrompt,
        size: '1024x1024',
        n: 1,
      })
      .catch((error) => {
        throw new BadRequestException(
          `OpenAI image generation failed: ${describeError(error)}`,
        );
      });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new BadRequestException('OpenAI did not return image data.');
    }
    return Buffer.from(b64, 'base64');
  }

  async hasPostedToday(
    businessId: number,
    platform: PostPlatform,
  ): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await this.publicationRepo.findOne({
      where: {
        platform,
        status: PublicationStatus.PUBLISHED,
        publishedAt: Between(startOfDay, endOfDay),
        post: { businessId },
      },
      relations: { post: true },
    });
    return !!existing;
  }

  /** Creates draft publication rows for the given platforms, without publishing them yet. */
  private async createDraftPublications(
    postId: number,
    platforms: PostPlatform[],
  ): Promise<void> {
    for (const platform of platforms) {
      await this.publicationRepo.save(
        this.publicationRepo.create({ postId, platform }),
      );
    }
  }

  async generateDailyPost(): Promise<Post> {
    const business = await this.businessService.getOrThrow();
    const content = await this.generateContent(business);
    const imageBuffer = await this.generateImage(content.imagePrompt);

    const fileName = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), imageBuffer);

    const post = this.repo.create({
      businessId: business.id,
      platform: PostPlatform.LINKEDIN,
      imagePrompt: content.imagePrompt,
      imageUrl: `/uploads/${fileName}`,
      caption: content.caption,
      hashtags: (content.hashtags ?? []).map((h) => `#${h}`).join(' '),
    });
    const saved = await this.repo.save(post);
    await this.createDraftPublications(saved.id, [PostPlatform.LINKEDIN]);

    const autoPublish =
      this.config.get<string>('AUTO_PUBLISH_ON_GENERATE') === 'true';
    if (autoPublish && business.autoPublish) {
      try {
        await this.publishToPlatform(saved.id, PostPlatform.LINKEDIN);
      } catch (error) {
        this.logger.warn(
          `Auto-publish failed for post ${saved.id}: ${describeError(error)}`,
        );
      }
    }

    return this.findOne(saved.id);
  }

  /**
   * Generates one piece of content (image + caption) for a business, tuned for
   * the given platform's tone, and creates draft publication slots for every
   * requested target platform so the same asset can be published to several
   * platforms without regenerating.
   */
  async generateForBusiness(
    businessSlug: string,
    platform: PostPlatform,
    targetPlatforms?: PostPlatform[],
  ): Promise<Post> {
    const business = await this.businessService.getBySlugOrThrow(businessSlug);

    const content =
      platform === PostPlatform.LINKEDIN
        ? await this.generateContent(business)
        : await this.generateMetaContent(business);
    const imageBuffer = await this.generateImage(content.imagePrompt);

    const fileName = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), imageBuffer);

    const post = this.repo.create({
      businessId: business.id,
      platform,
      imagePrompt: content.imagePrompt,
      imageUrl: `/uploads/${fileName}`,
      caption: content.caption,
      hashtags: (content.hashtags ?? []).map((h) => `#${h}`).join(' '),
    });
    const saved = await this.repo.save(post);

    const platforms = targetPlatforms?.length ? targetPlatforms : [platform];
    await this.createDraftPublications(saved.id, platforms);

    return this.findOne(saved.id);
  }

  /**
   * Generates one shared image+caption for a business and publishes it to
   * every given Meta platform (facebook/instagram), reusing the same asset.
   * Each platform is published independently — one failing does not block the other.
   */
  async generateAndPublishMetaForBusiness(
    businessSlug: string,
    platforms: PostPlatform[],
  ): Promise<Post> {
    const post = await this.generateForBusiness(
      businessSlug,
      PostPlatform.FACEBOOK,
      platforms,
    );

    for (const platform of platforms) {
      try {
        await this.publishToPlatform(post.id, platform);
      } catch (error) {
        this.logger.error(
          `Failed to publish ${platform} post for "${businessSlug}": ${describeError(error)}`,
        );
      }
    }

    const business = await this.businessService.findBySlug(businessSlug);
    if (business) {
      await this.businessService.markPosted(business.id, new Date());
    }

    return this.findOne(post.id);
  }

  /**
   * Generates and publishes for a business across any mix of platforms.
   * LinkedIn gets its own generation (different tone/prompt); Facebook and
   * Instagram share one generation/asset. Each resulting post publishes
   * independently, one platform failing does not block another.
   */
  async generateAndPublishForBusiness(
    businessSlug: string,
    platforms: PostPlatform[],
  ): Promise<Post[]> {
    const results: Post[] = [];
    const metaPlatforms = platforms.filter(
      (p) => p === PostPlatform.FACEBOOK || p === PostPlatform.INSTAGRAM,
    );
    const wantsLinkedIn = platforms.includes(PostPlatform.LINKEDIN);

    if (wantsLinkedIn) {
      try {
        const post = await this.generateForBusiness(
          businessSlug,
          PostPlatform.LINKEDIN,
        );
        await this.publishToPlatform(post.id, PostPlatform.LINKEDIN);
        results.push(await this.findOne(post.id));
      } catch (error) {
        this.logger.error(
          `Failed to generate/publish LinkedIn post for "${businessSlug}": ${describeError(error)}`,
        );
      }
    }

    if (metaPlatforms.length > 0) {
      try {
        results.push(
          await this.generateAndPublishMetaForBusiness(businessSlug, metaPlatforms),
        );
      } catch (error) {
        this.logger.error(
          `Failed to generate/publish Meta post for "${businessSlug}": ${describeError(error)}`,
        );
      }
    }

    if (wantsLinkedIn || metaPlatforms.length > 0) {
      const business = await this.businessService.findBySlug(businessSlug);
      if (business) {
        await this.businessService.markPosted(business.id, new Date());
      }
    }

    return results;
  }

  /** Publishes (or re-publishes) a post to one specific platform. */
  async publishToPlatform(postId: number, platform: PostPlatform): Promise<Post> {
    const post = await this.findOne(postId);
    let publication = post.publications.find((p) => p.platform === platform);
    if (!publication) {
      publication = await this.publicationRepo.save(
        this.publicationRepo.create({ postId, platform }),
      );
    }
    if (publication.status === PublicationStatus.PUBLISHED) {
      return post;
    }

    const text = `${post.caption}\n\n${post.hashtags ?? ''}`.trim();
    const business = post.businessId
      ? await this.businessService.findById(post.businessId)
      : null;
    if (!business) {
      throw new BadRequestException(
        `Post ${postId} has no associated business; cannot resolve publishing credentials.`,
      );
    }

    try {
      let externalId: string;
      if (platform === PostPlatform.FACEBOOK || platform === PostPlatform.INSTAGRAM) {
        externalId =
          platform === PostPlatform.FACEBOOK
            ? await this.metaService.publishToFacebookPage({
                businessSlug: business.slug,
                imageUrl: post.imageUrl,
                caption: text,
              })
            : await this.metaService.publishToInstagram({
                businessSlug: business.slug,
                imageUrl: post.imageUrl,
                caption: text,
              });
      } else {
        const filePath = path.join(process.cwd(), post.imageUrl.replace(/^\//, ''));
        const imageBuffer = fs.readFileSync(filePath);
        externalId = await this.linkedInService.publishImagePost({
          businessId: business.id,
          text,
          imageBuffer,
        });
      }
      publication.status = PublicationStatus.PUBLISHED;
      publication.externalPostId = externalId;
      publication.publishedAt = new Date();
      publication.errorMessage = null;
    } catch (error) {
      publication.status = PublicationStatus.FAILED;
      publication.errorMessage = describeError(error);
      await this.publicationRepo.save(publication);
      throw error;
    }

    await this.publicationRepo.save(publication);
    return this.findOne(postId);
  }

  /** @deprecated use publishToPlatform; kept for the generic single-platform publish route */
  async publish(id: number): Promise<Post> {
    const post = await this.findOne(id);
    const target = post.publications[0]?.platform ?? post.platform;
    return this.publishToPlatform(id, target);
  }
}
