import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { LinkedInModule } from '../linkedin/linkedin.module';
import { MetaModule } from '../meta/meta.module';
import { Post } from './post.entity';
import { PostPublication } from './post-publication.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostPublication]),
    BusinessModule,
    LinkedInModule,
    MetaModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
