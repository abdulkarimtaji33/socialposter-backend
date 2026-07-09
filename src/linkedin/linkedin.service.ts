import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { LinkedInAccount } from './linkedin-account.entity';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);

  constructor(
    @InjectRepository(LinkedInAccount)
    private readonly repo: Repository<LinkedInAccount>,
    private readonly config: ConfigService,
  ) {}

  getAuthUrl(): string {
    const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID');
    const redirectUri = this.config.get<string>('LINKEDIN_REDIRECT_URI');
    if (!clientId || !redirectUri) {
      throw new BadRequestException(
        'LinkedIn app is not configured. Set LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / LINKEDIN_REDIRECT_URI.',
      );
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: LINKEDIN_SCOPES.join(' '),
      state: 'socialposter',
    });
    return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<LinkedInAccount> {
    const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID');
    const clientSecret = this.config.get<string>('LINKEDIN_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('LINKEDIN_REDIRECT_URI');

    const tokenResponse = await axios.post(
      LINKEDIN_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri ?? '',
        client_id: clientId ?? '',
        client_secret: clientSecret ?? '',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, expires_in } = tokenResponse.data;

    const profileResponse = await axios.get(
      `${LINKEDIN_API_BASE}/userinfo`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    const personUrn = `urn:li:person:${profileResponse.data.sub}`;
    const name = profileResponse.data.name ?? null;

    let account = await this.repo.findOne({ where: {} });
    if (!account) {
      account = this.repo.create();
    }
    account.accessToken = access_token;
    account.expiresAt = new Date(Date.now() + expires_in * 1000);
    account.personUrn = personUrn;
    account.name = name;

    return this.repo.save(account);
  }

  async getStatus(): Promise<{
    connected: boolean;
    name?: string;
    expiresAt?: Date;
  }> {
    const account = await this.repo.findOne({ where: {} });
    if (!account) {
      return { connected: false };
    }
    return {
      connected: true,
      name: account.name,
      expiresAt: account.expiresAt,
    };
  }

  async disconnect(): Promise<void> {
    await this.repo.clear();
  }

  private async getAccountOrThrow(): Promise<LinkedInAccount> {
    const account = await this.repo.findOne({ where: {} });
    if (!account) {
      throw new NotFoundException(
        'LinkedIn account is not connected. Connect it first.',
      );
    }
    if (account.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'LinkedIn access token has expired. Please reconnect your account.',
      );
    }
    return account;
  }

  async publishImagePost(params: {
    text: string;
    imageBuffer: Buffer;
  }): Promise<string> {
    const account = await this.getAccountOrThrow();
    const headers = {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    };

    const registerResponse = await axios.post(
      `${LINKEDIN_API_BASE}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: account.personUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
        },
      },
      { headers },
    );

    const uploadUrl =
      registerResponse.data.value.uploadMechanism[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ].uploadUrl;
    const asset = registerResponse.data.value.asset;

    await axios.put(uploadUrl, params.imageBuffer, {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
    });

    const ugcResponse = await axios.post(
      `${LINKEDIN_API_BASE}/ugcPosts`,
      {
        author: account.personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: params.text },
            shareMediaCategory: 'IMAGE',
            media: [
              {
                status: 'READY',
                media: asset,
              },
            ],
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      },
      { headers },
    );

    this.logger.log(`Published LinkedIn post ${ugcResponse.data.id}`);
    return ugcResponse.data.id;
  }
}
