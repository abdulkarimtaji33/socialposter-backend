import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessProfile } from '../business/business-profile.entity';
import { PostPublication } from './post-publication.entity';
import { PostPlatform } from './post-platform.enum';

export { PostPlatform };

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  @ManyToOne(() => BusinessProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'businessId' })
  business: BusinessProfile | null;

  /** The platform whose prompt style/tone this content was generated for. */
  @Column({ type: 'enum', enum: PostPlatform, default: PostPlatform.LINKEDIN })
  platform: PostPlatform;

  @Column({ type: 'text' })
  imagePrompt: string;

  @Column({ length: 500 })
  imageUrl: string;

  @Column({ type: 'text' })
  caption: string;

  @Column({ type: 'text', nullable: true })
  hashtags: string;

  /** Original uploaded product photo this post was generated from, if any. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceImageUrl: string | null;

  /** User-provided brief that accompanied the product photo upload, if any. */
  @Column({ type: 'text', nullable: true })
  brief: string | null;

  @OneToMany(() => PostPublication, (publication) => publication.post, {
    cascade: true,
    eager: true,
  })
  publications: PostPublication[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
