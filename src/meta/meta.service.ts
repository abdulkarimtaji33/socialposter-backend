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

  private async resolvePageAccessToken(
    pageId: string,
    token: string,
  ): Promise<string> {
    try {
      const debug = await axios.get(`${META_GRAPH_API_BASE}/debug_token`, {
        params: { input_token: token, access_token: token },
      });
      const data = debug.data?.data as
        | { type?: string; is_valid?: boolean }
        | undefined;
      if (data?.type === 'PAGE' && data.is_valid) {
        return token;
      }
    } catch {
      // Fall through to /me/accounts lookup.
    }

    const accounts = await axios.get(`${META_GRAPH_API_BASE}/me/accounts`, {
      params: { fields: 'id,access_token', access_token: token },
    });
    const match = (accounts.data?.data as Array<{ id: string; access_token?: string }> | undefined)?.find(
      (account) => account.id === pageId,
    );
    if (!match?.access_token) {
      throw new BadRequestException(
        `Could not resolve a Page access token for page "${pageId}". ` +
          'Provide a Page token, or a user/system token with pages_manage_posts for that page.',
      );
    }

    return match.access_token;
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
    const pageToken = await this.resolvePageAccessToken(fbPageId, fbPageToken);
    const publicImageUrl = this.getPublicImageUrl(params.imageUrl);

    const response = await axios.post(
      `${META_GRAPH_API_BASE}/${fbPageId}/photos`,
      null,
      {
        params: {
          url: publicImageUrl,
          caption: params.caption,
          access_token: pageToken,
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
    const { fbPageId, fbPageToken, igBusinessId, igToken } =
      getMetaAccountConfig(this.config, params.businessSlug);
    const pageToken = await this.resolvePageAccessToken(fbPageId, fbPageToken);
    const igAccessToken = igToken === fbPageToken ? pageToken : igToken;
    const publicImageUrl = this.getPublicImageUrl(params.imageUrl);

    const createResponse = await axios.post(
      `${META_GRAPH_API_BASE}/${igBusinessId}/media`,
      {
        image_url: publicImageUrl,
        caption: params.caption,
        access_token: igAccessToken,
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
        access_token: igAccessToken,
      },
    );

    const mediaId = publishResponse.data.id;
    this.logger.log(
      `Published Instagram post ${mediaId} for business "${params.businessSlug}"`,
    );
    return mediaId;
  }
}
