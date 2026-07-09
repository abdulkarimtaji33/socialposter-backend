import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  imagePrompt: string;

  @Column({ length: 500 })
  imageUrl: string;

  @Column({ type: 'text' })
  caption: string;

  @Column({ type: 'text', nullable: true })
  hashtags: string;

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.DRAFT })
  status: PostStatus;

  @Column({ length: 255, nullable: true })
  linkedinPostId: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ nullable: true })
  publishedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
