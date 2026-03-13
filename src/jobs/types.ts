export type RawProduct = {
  rank?: string;
  code: string;
  brand?: string;
  name: string;
  priceJPYTaxIn?: number | null;
  priceText?: string;
  colorsText?: string;
  categorySmallName?: string;
  colorName?: string;
  image?: string;
  url?: string;
  badges?: string[];
};

export type CrawlRecord = {
  url: string;
  status: string;
  html?: string;
  markdown?: string;
  json?: unknown;
  metadata?: {
    status?: number;
    title?: string;
    url?: string;
  };
};

export type CrawlResult = {
  id: string;
  status: string;
  total?: number;
  finished?: number;
  records: CrawlRecord[];
};

export type NormalizedProduct = {
  sourceSite: string;
  sourceProductCode: string;
  titleJa: string;
  titleZhTw: string | null;
  brand: string | null;
  category: string | null;
  priceJpyTaxIn: number | null;
  colorCount: number | null;
  imageUrl: string | null;
  isActive: number;
  lastCrawledAt: string;
  sourcePayloadJson: string;
  statusBadgesJson: string | null;
};

