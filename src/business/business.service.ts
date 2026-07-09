import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessProfile } from './business-profile.entity';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto';

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(BusinessProfile)
    private readonly repo: Repository<BusinessProfile>,
  ) {}

  async get(): Promise<BusinessProfile | null> {
    return this.repo.findOne({ where: {}, order: { id: 'ASC' } });
  }

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
    const existing = await this.get();
    const entity = this.repo.create({ ...existing, ...dto });
    return this.repo.save(entity);
  }
}
