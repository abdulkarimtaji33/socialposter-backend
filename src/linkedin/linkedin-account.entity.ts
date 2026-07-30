import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessProfile } from '../business/business-profile.entity';

@Entity('linkedin_accounts')
@Unique(['businessId'])
export class LinkedInAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  businessId: number;

  @ManyToOne(() => BusinessProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: BusinessProfile;

  @Column({ type: 'text' })
  accessToken: string;

  @Column()
  expiresAt: Date;

  @Column({ length: 255 })
  personUrn: string;

  @Column({ length: 255, nullable: true })
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
