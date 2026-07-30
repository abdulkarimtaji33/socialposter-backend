import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { getMetaAccountConfig } from './meta-account.config';

const META_GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(businessSlug: string): boolean {
    try {
      getMetaAccountConfig(this.config, businessSlug);
      return true;
    } catch {
      return false;
    }
  }

  private getPublicImageUrl(imageUrl: string): string {
    const base = this.config.get<string>('PUBLIC_BASE_URL');
    if (!base) {
      throw new BadRequestException(
        'PUBLIC_BASE_URL is not configured. Facebook/Instagram need a publicly reachable image URL.',
      );
    }
    return `${base.replace(/\/$/, '')}${imageUrl}`;
  }

  async publishToFacebookPage(params: {
    businessSlug: string;
    imageUrl: string;
    caption: string;
  }): Promise<string> {
    const { fbPageId, fbPageToken } = getMetaAccountConfig(
      this.config,
      params.businessSlug,
    );
    const publicImageUrl = this.getPublicImageUrl(params.imageUrl);

    const response = await axios.post(
      `${META_GRAPH_API_BASE}/${fbPageId}/photos`,
      null,
      {
        params: {
          url: publicImageUrl,
          caption: params.caption,
          access_token: fbPageToken,
        },
      },
    );

    const postId = response.data.post_id ?? response.data.id;
    this.logger.log(
      `Published Facebook post ${postId} for business "${params.businessSlug}"`,
    );
    return postId;
  }

  async publishToInstagram(params: {
    businessSlug: string;
    imageUrl: string;
    caption: string;
  }): Promise<string> {
    const { igBusinessId, igToken } = getMetaAccountConfig(
      this.config,
      params.businessSlug,
    );
    const publicImageUrl = this.getPublicImageUrl(params.imageUrl);

    const createResponse = await axios.post(
      `${META_GRAPH_API_BASE}/${igBusinessId}/media`,
      {
        image_url: publicImageUrl,
        caption: params.caption,
        access_token: igToken,
      },
    );

    const creationId = createResponse.data.id;
    if (!creationId) {
      throw new BadRequestException(
        'Instagram did not return a media creation id.',
      );
    }

    const publishResponse = await axios.post(
      `${META_GRAPH_API_BASE}/${igBusinessId}/media_publish`,
      {
        creation_id: creationId,
        access_token: igToken,
      },
    );

    const mediaId = publishResponse.data.id;
    this.logger.log(
      `Published Instagram post ${mediaId} for business "${params.businessSlug}"`,
    );
    return mediaId;
  }
}
