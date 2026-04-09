import type { NormalizedProduct } from './types';

export function parseStoredProductPayload(raw: string | null | undefined): {
  gallery: string[];
  description: string;
  schema: Record<string, unknown> | null;
  specs: Record<string, string>;
  sizeOptions: string[];
  colorOptions: string[];
} {
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const rawSpecs = parsed.specs && typeof parsed.specs === 'object' && !Array.isArray(parsed.specs)
      ? (parsed.specs as Record<string, unknown>)
      : {};
    const specs: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawSpecs)) {
      if (typeof v === 'string' && v.trim()) specs[k] = v;
    }
    return {
      gallery: Array.isArray(parsed.gallery)
        ? parsed.gallery.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [],
      description: typeof parsed.description === 'string' ? parsed.description : '',
      schema:
        parsed.schema && typeof parsed.schema === 'object'
          ? (parsed.schema as Record<string, unknown>)
          : null,
      specs,
      sizeOptions: Array.isArray(parsed.sizeOptions)
        ? parsed.sizeOptions.filter((x): x is string => typeof x === 'string')
        : [],
      colorOptions: Array.isArray(parsed.colorOptions)
        ? parsed.colorOptions.filter((x): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return {
      gallery: [],
      description: '',
      schema: null,
      specs: {},
      sizeOptions: [],
      colorOptions: [],
    };
  }
}

export function buildProductUpsertPayload(item: NormalizedProduct): {
  columns: string[];
  values: Array<string | number | null>;
} {
  const columns = [
    'source_site',
    'source_product_code',
    'title_ja',
    'title_zh_tw',
    'brand',
    'category',
    'price_jpy_tax_in',
    'color_count',
    'image_url',
    'is_active',
    'last_crawled_at',
    'source_payload_json',
    'status_badges_json',
  ];

  const values = [
    item.sourceSite,
    item.sourceProductCode,
    item.titleJa,
    item.titleZhTw,
    item.brand,
    item.category,
    item.priceJpyTaxIn,
    item.colorCount,
    item.imageUrl,
    item.isActive,
    item.lastCrawledAt,
    item.sourcePayloadJson,
    item.statusBadgesJson,
  ];

  return { columns, values };
}
