import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post as HttpPost,
  Query,
} from '@nestjs/common';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostPlatform } from './post.entity';
import { PostsService } from './posts.service';

function parsePlatform(value: string): PostPlatform {
  if (!Object.values(PostPlatform).includes(value as PostPlatform)) {
    throw new BadRequestException(
      `Invalid platform "${value}". Must be one of: ${Object.values(PostPlatform).join(', ')}.`,
    );
  }
  return value as PostPlatform;
}

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @HttpPost('generate')
  async generate(
    @Query('business') business?: string,
    @Query('platform') platform?: string,
    @Query('targetPlatforms') targetPlatforms?: string,
  ) {
    if (!business) {
      return this.postsService.generateDailyPost();
    }

    const resolvedPlatform = parsePlatform(platform ?? PostPlatform.LINKEDIN);
    const resolvedTargets = targetPlatforms
      ? targetPlatforms.split(',').map((p) => parsePlatform(p.trim()))
      : undefined;

    return this.postsService.generateForBusiness(
      business,
      resolvedPlatform,
      resolvedTargets,
    );
  }

  @Get()
  async findAll(
    @Query('business') business?: string,
    @Query('platform') platform?: PostPlatform,
  ) {
    return this.postsService.findAll({ businessSlug: business, platform });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.postsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, dto);
  }

  @HttpPost(':id/publish')
  async publish(@Param('id', ParseIntPipe) id: number) {
    return this.postsService.publish(id);
  }

  @HttpPost(':id/publish/:platform')
  async publishToPlatform(
    @Param('id', ParseIntPipe) id: number,
    @Param('platform') platform: string,
  ) {
    return this.postsService.publishToPlatform(id, parsePlatform(platform));
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.postsService.remove(id);
    return { success: true };
  }
}
