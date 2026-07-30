import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BusinessProfile } from '../business/business-profile.entity';

@Entity('logos')
export class Logo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  businessId: number;

  @ManyToOne(() => BusinessProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: BusinessProfile;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ length: 500 })
  imageUrl: string;

  /** The logo this one was edited from, if any (forms an edit history chain). */
  @Column({ type: 'int', nullable: true })
  parentLogoId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
