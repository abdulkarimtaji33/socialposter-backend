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
import { Post } from './post.entity';
import { PostPlatform } from './post-platform.enum';

export enum PublicationStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

@Entity('post_publications')
@Unique(['postId', 'platform'])
export class PostPublication {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  postId: number;

  @ManyToOne(() => Post, (post) => post.publications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;

  @Column({ type: 'enum', enum: PostPlatform })
  platform: PostPlatform;

  @Column({ type: 'enum', enum: PublicationStatus, default: PublicationStatus.DRAFT })
  status: PublicationStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalPostId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
