import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessProfile } from './business-profile.entity';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto';

const SEED_BUSINESSES: Array<
  Pick<BusinessProfile, 'slug' | 'name' | 'description' | 'autoPublish'>
> = [
  {
    slug: 'zenzicly',
    name: 'Zenzicly',
    description:
      'Online store selling gemstones, crystal jewelry, and gaming products (with more categories like watches and accessories coming soon).',
    autoPublish: true,
  },
  {
    slug: 'cgagames',
    name: 'CGA Games',
    description:
      '#1 gaming store in the UAE & GCC — PS5, Xbox, Nintendo Switch consoles, games, accessories, and collectibles.',
    autoPublish: true,
  },
];

@Injectable()
export class BusinessService implements OnModuleInit {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectRepository(BusinessProfile)
    private readonly repo: Repository<BusinessProfile>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const seed of SEED_BUSINESSES) {
      const existing = await this.findBySlug(seed.slug);
      if (!existing) {
        await this.repo.save(this.repo.create(seed));
        this.logger.log(`Seeded business profile "${seed.slug}"`);
      }
    }
  }

  async findAll(): Promise<BusinessProfile[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findAllAutoPublish(): Promise<BusinessProfile[]> {
    return this.repo.find({ where: { autoPublish: true }, order: { id: 'ASC' } });
  }

  async findBySlug(slug: string): Promise<BusinessProfile | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async findById(id: number): Promise<BusinessProfile | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getBySlugOrThrow(slug: string): Promise<BusinessProfile> {
    const profile = await this.findBySlug(slug);
    if (!profile) {
      throw new NotFoundException(`No business profile found for slug "${slug}".`);
    }
    return profile;
  }

  /** @deprecated single-business accessor kept for backward compatibility; defaults to the first business */
  async get(): Promise<BusinessProfile | null> {
    return this.repo.findOne({ where: {}, order: { id: 'ASC' } });
  }

  /** @deprecated single-business accessor kept for backward compatibility; defaults to the first business */
  async getOrThrow(): Promise<BusinessProfile> {
    const profile = await this.get();
    if (!profile) {
      throw new NotFoundException(
        'No business profile found. Please save your business details first.',
      );
    }
    return profile;
  }

  async upsert(dto: UpsertBusinessProfileDto): Promise<BusinessProfile> {
    const existing = dto.slug
      ? (await this.findBySlug(dto.slug)) ?? (await this.get())
      : await this.get();
    const entity = this.repo.create({ ...existing, ...dto });
    return this.repo.save(entity);
  }

  async upsertBySlug(
    slug: string,
    dto: Partial<UpsertBusinessProfileDto>,
  ): Promise<BusinessProfile> {
    const existing = await this.findBySlug(slug);
    if (existing) {
      await this.repo.update({ id: existing.id }, dto);
      return this.getBySlugOrThrow(slug);
    }
    const entity = this.repo.create({ ...dto, slug });
    return this.repo.save(entity);
  }

  async markPosted(id: number, when: Date): Promise<void> {
    await this.repo.update({ id }, { lastPostedAt: when });
  }
}
