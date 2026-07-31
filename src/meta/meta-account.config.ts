import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MetaAccountConfig {
  fbPageId: string;
  fbPageToken: string;
  igBusinessId: string;
  igToken: string;
}

const SLUG_ENV_PREFIX: Record<string, string> = {
  zenzicly: 'ZENZICLY',
  cgagames: 'CGAGAMES',
  zenzicas: 'ZENZICAS',
};

export function getMetaAccountConfig(
  config: ConfigService,
  slug: string,
): MetaAccountConfig {
  const prefix = SLUG_ENV_PREFIX[slug];
  if (!prefix) {
    throw new BadRequestException(
      `No Meta (Facebook/Instagram) account is configured for business "${slug}".`,
    );
  }

  const fbPageId = config.get<string>(`${prefix}_FB_PAGE_ID`);
  const fbPageToken = config.get<string>(`${prefix}_FB_PAGE_TOKEN`);
  const igBusinessId = config.get<string>(`${prefix}_IG_BUSINESS_ID`);
  const igToken = config.get<string>(`${prefix}_IG_TOKEN`);

  if (!fbPageId || !fbPageToken || !igBusinessId || !igToken) {
    throw new BadRequestException(
      `Meta credentials for business "${slug}" are incomplete. Check ${prefix}_FB_PAGE_ID / ${prefix}_FB_PAGE_TOKEN / ${prefix}_IG_BUSINESS_ID / ${prefix}_IG_TOKEN in .env.`,
    );
  }

  return { fbPageId, fbPageToken, igBusinessId, igToken };
}
