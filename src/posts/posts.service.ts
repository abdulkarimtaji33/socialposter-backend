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
import OpenAI, { toFile } from 'openai';
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

interface ProductPostCopy {
  hook: string;
  ctaText: string;
  caption: string;
  hashtags: string[];
}

const PHOTO_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

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
    for (const url of [post.imageUrl, post.sourceImageUrl]) {
      if (!url) continue;
      const filePath = path.join(process.cwd(), url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
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
    zenzicas:
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

  // --- Product photo -> designed post ---

  /**
   * Palette/lighting/mood-only backdrop direction per business, deliberately
   * separate from META_VISUALS: META_VISUALS describes OBJECTS (consoles,
   * gemstones) which would fight input_fidelity by telling the image model to
   * add extra objects around the user's real uploaded product.
   */
  private static readonly PRODUCT_POST_BACKDROPS: Record<string, string> = {
    zenzicly:
      'premium dark purple and indigo palette, gold and teal accent lighting, soft luxury studio mood',
    cgagames:
      'neon purple and red accent lighting on a dark backdrop, high-energy gaming mood, punchy contrast',
    zenzicas:
      'deep navy and electric blue gradient, clean corporate-tech mood, crisp and modern',
  };

  private static readonly PRODUCT_POST_BACKDROP_FALLBACK =
    'a clean neutral studio backdrop with soft directional lighting that flatters the product without competing with it';

  private static readonly DEFAULT_PRODUCT_POST_PROMPT_TEMPLATE = `You are a senior social media copywriter for {businessName}.
About the business: {businessDescription}

The attached image is a real product photo this business wants to post about.
Here is what they said about it: "{brief}"

Study the photo properly before writing. Notice the actual product: its colour,
material, shape, finish, and any branding or text physically printed on it.
Everything you write must be true to what is genuinely visible in that photo.
Never invent a feature, material, colour, or claim the photo does not support.

Write a post that earns its place in a feed:

HOOK: one scroll-stopping opening line, under 60 characters. It should make
someone stop mid-scroll. No "Introducing", no "Check out our", no generic
announcement voice.

CONTENT: 2 to 4 sentences that make a real buyer want this specific product.
Be concrete and sensory, tied to what is actually in the photo and to the brief.
Weave in the words a real buyer would type into a search (the product type, the
material, the occasion or use case, the category this business sells in) so the
post is discoverable, but it has to read like a person wrote it. If it sounds
like keywords were bolted on, rewrite it.

CTA: one clear, specific action tied to this product, not a generic sign-off.

HASHTAGS: 4 to 6 that someone who actually buys this kind of product would
follow. Mix broad reach with specific niche.

Never use em dashes or double dashes anywhere; use a period, comma, or "and".

Respond ONLY with strict JSON, no markdown fences:
{
  "hook": "the hook line, under 60 characters, exactly as it should be rendered on the image",
  "ctaText": "a very short CTA for the image itself, 2 to 5 words, e.g. 'Shop the drop'",
  "caption": "the full caption: hook as the first line, then the content sentences, then the CTA. Under 130 words. Do not append hashtags.",
  "hashtags": ["4 to 6 relevant hashtags without the # symbol"]
}`;

  private buildProductImagePrompt(params: {
    businessName: string;
    backdrop: string;
    hook: string;
    ctaText: string;
  }): string {
    return `Turn this product photo into a polished, professional square (1:1) social media
graphic for ${params.businessName}.

Keep the product itself exactly as it appears in the photo. Do not change its
shape, colour, material, proportions, or any logo or text physically printed on
it. It must remain unmistakably the same real product a customer would receive.

Restyle only what is around it. Replace or elevate the background, add tasteful
studio lighting, soft realistic shadows, and depth so the product reads as
premium and deliberately shot. Use this brand mood: ${params.backdrop}

Do not add any extra objects, props, products, or scenery beyond simple
backdrop, lighting and shadow. The uploaded product is the only subject.

Compose it like a designed marketing graphic, not a plain product photo:
- The product is the clear hero, with generous breathing room around it.
- Overlay this exact headline near the top, bold, clean sans-serif: "${params.hook}"
- Overlay this exact call to action near the bottom, smaller, set in a pill or
  button shape: "${params.ctaText}"
- Every overlaid character must be crisp, correctly spelled, high contrast
  against whatever sits behind it, and comfortably readable on a phone.
- Never let text cover the product's key details, and never let it run off the
  edge of the frame.

Do not add any other text, watermark, logo, price, badge, or website address
beyond the two lines specified above and whatever is genuinely printed on the
product itself.`;
  }

  private async callOpenAiForProductCopy(
    model: string,
    prompt: string,
    photo: { buffer: Buffer; mimetype: string },
  ): Promise<{ copy: ProductPostCopy; sawPhoto: boolean }> {
    const imagePart = {
      type: 'image_url' as const,
      image_url: {
        url: `data:${photo.mimetype};base64,${photo.buffer.toString('base64')}`,
      },
    };

    let raw: string | null | undefined;
    let sawPhoto = true;
    try {
      const completion = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }, imagePart],
          },
        ],
        response_format: { type: 'json_object' },
      });
      raw = completion.choices[0]?.message?.content;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 400) {
        throw new BadRequestException(
          `OpenAI request failed: ${describeError(error)}`,
        );
      }
      // Vision may be unsupported on this model; degrade to text-only rather
      // than hard-failing the whole feature.
      this.logger.warn(
        `Vision-based product copy call failed with 400, retrying text-only: ${describeError(error)}`,
      );
      sawPhoto = false;
      const textOnlyCompletion = await this.openai.chat.completions
        .create({
          model,
          messages: [
            {
              role: 'user',
              content: `${prompt}\n\nYou cannot see the photo; write from the brief alone and stay general about appearance.`,
            },
          ],
          response_format: { type: 'json_object' },
        })
        .catch((err) => {
          throw new BadRequestException(
            `OpenAI request failed: ${describeError(err)}`,
          );
        });
      raw = textOnlyCompletion.choices[0]?.message?.content;
    }

    if (!raw) {
      throw new BadRequestException('OpenAI did not return any content.');
    }

    let parsed: ProductPostCopy;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Failed to parse OpenAI response as JSON.');
    }

    parsed.hook = stripBannedDashes(parsed.hook ?? '');
    parsed.ctaText = stripBannedDashes(parsed.ctaText ?? '');
    parsed.caption = stripBannedDashes(parsed.caption ?? '');
    parsed.hashtags = (parsed.hashtags ?? []).map((h) => stripBannedDashes(h));
    return { copy: parsed, sawPhoto };
  }

  private async generateProductImage(params: {
    photo: { buffer: Buffer; mimetype: string; extension: string };
    prompt: string;
  }): Promise<Buffer> {
    const model = this.config.get<string>('OPENAI_IMAGE_MODEL') ?? 'gpt-image-2';
    const imageFile = await toFile(
      params.photo.buffer,
      `product.${params.photo.extension}`,
      { type: params.photo.mimetype },
    );

    const result = await this.openai.images
      .edit({
        model,
        image: [imageFile],
        prompt: params.prompt,
        size: '1024x1024',
        quality: 'high',
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

  /**
   * Generates a post from a real, uploaded product photo: a vision-capable
   * copywriter call reads the photo and writes hook/content/CTA copy, then
   * the same photo is fed into an image edit with input_fidelity:'high' so
   * the real product is preserved while the background is restyled and the
   * hook/CTA text is baked onto the image. Nothing is written to disk until
   * both AI calls succeed.
   */
  async generateFromProductPhoto(
    businessSlug: string,
    photo: { buffer: Buffer; mimetype: string },
    brief: string,
    targetPlatforms?: PostPlatform[],
  ): Promise<Post> {
    const business = await this.businessService.getBySlugOrThrow(businessSlug);

    const extension = PHOTO_MIME_EXTENSIONS[photo.mimetype];
    if (!extension) {
      throw new BadRequestException(
        `Unsupported image type "${photo.mimetype}". Use PNG, JPEG, or WEBP.`,
      );
    }

    const copyModel =
      this.config.get<string>('OPENAI_VISION_MODEL') ??
      this.config.get<string>('OPENAI_MODEL') ??
      'gpt-5-mini';

    const template =
      business.productPostPromptTemplate?.trim() ||
      PostsService.DEFAULT_PRODUCT_POST_PROMPT_TEMPLATE;
    const copyPrompt = template
      .replaceAll('{businessName}', business.name)
      .replaceAll('{businessDescription}', business.description)
      .replaceAll('{brief}', brief);

    const { copy } = await this.callOpenAiForProductCopy(copyModel, copyPrompt, photo);

    const backdrop =
      PostsService.PRODUCT_POST_BACKDROPS[business.slug] ??
      PostsService.PRODUCT_POST_BACKDROP_FALLBACK;
    const imagePrompt = stripBannedDashes(
      this.buildProductImagePrompt({
        businessName: business.name,
        backdrop,
        hook: copy.hook,
        ctaText: copy.ctaText,
      }),
    );

    const imageBuffer = await this.generateProductImage({
      photo: { ...photo, extension },
      prompt: imagePrompt,
    });

    const sourceFileName = `${randomUUID()}-source.${extension}`;
    const generatedFileName = `${randomUUID()}.png`;

    let saved: Post;
    try {
      fs.writeFileSync(path.join(UPLOADS_DIR, sourceFileName), photo.buffer);
      fs.writeFileSync(path.join(UPLOADS_DIR, generatedFileName), imageBuffer);

      const platforms = targetPlatforms?.length
        ? targetPlatforms
        : [PostPlatform.FACEBOOK];
      const platform = platforms.includes(PostPlatform.LINKEDIN)
        ? platforms.every((p) => p === PostPlatform.LINKEDIN)
          ? PostPlatform.LINKEDIN
          : PostPlatform.FACEBOOK
        : PostPlatform.FACEBOOK;

      const post = this.repo.create({
        businessId: business.id,
        platform,
        imagePrompt,
        imageUrl: `/uploads/${generatedFileName}`,
        sourceImageUrl: `/uploads/${sourceFileName}`,
        brief,
        caption: copy.caption,
        hashtags: (copy.hashtags ?? []).map((h) => `#${h}`).join(' '),
      });
      saved = await this.repo.save(post);
      await this.createDraftPublications(saved.id, platforms);
    } catch (error) {
      for (const fileName of [sourceFileName, generatedFileName]) {
        const filePath = path.join(UPLOADS_DIR, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      throw error;
    }

    return this.findOne(saved.id);
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
