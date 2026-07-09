import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('linkedin_accounts')
export class LinkedInAccount {
  @PrimaryGeneratedColumn()
  id: number;

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
