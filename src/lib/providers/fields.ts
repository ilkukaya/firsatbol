import type { RawDealInput } from '../deals/normalize';

/**
 * Field mapping from an arbitrary provider record to RawDealInput.
 *
 * Because the partner's response schema has not been confirmed from a real response yet,
 * we use a list of CANDIDATE keys per field (case/underscore-insensitive) and allow the
 * owner to pin exact paths via an explicit map (env var `*_FIELD_MAP`, JSON), e.g.
 *   {"title":"dealTitle","price":"pricing.final","sourceUrl":"links.0.href"}
 * Explicit paths always win. Run `npm run provider:inspect` to see real keys.
 */
export type FieldName = keyof RawDealInput;
export type FieldMap = Partial<Record<FieldName, string>>;

export const CANDIDATE_KEYS: Record<FieldName, string[]> = {
  externalId: ['id', 'dealId', 'deal_id', 'firsatId', 'campaignId', 'productId', 'eventId', 'guid', 'code', 'sku'],
  title: ['title', 'name', 'dealTitle', 'dealName', 'baslik', 'ad', 'headline', 'shortTitle'],
  description: [
    'description',
    'desc',
    'details',
    'detail',
    'content',
    'aciklama',
    'longDescription',
    'body',
    'text',
    'shortDescription',
    'summary',
  ],
  summary: [],
  merchant: [
    'merchant',
    'merchantName',
    'company',
    'companyName',
    'firm',
    'firma',
    'brand',
    'marka',
    'vendor',
    'seller',
    'store',
    'venue',
    'mekan',
    'place',
    'placeName',
    'businessName',
  ],
  address: ['address', 'businessData.0.address', 'location.address', 'adres'],
  category: ['category', 'categoryName', 'kategori', 'channel', 'channelName', 'kanal', 'type', 'dealType'],
  city: ['city', 'cityName', 'sehir', 'il', 'location.city', 'address.city'],
  district: ['district', 'districtName', 'ilce', 'town', 'semt', 'location.district', 'address.district'],
  originalPrice: [
    'originalPrice',
    'original_price',
    'oldPrice',
    'old_price',
    'listPrice',
    'list_price',
    'regularPrice',
    'marketPrice',
    'normalPrice',
    'piyasaFiyati',
    'eskiFiyat',
    'fullPrice',
    'price.original',
  ],
  price: [
    'discountedPrice',
    'discounted_price',
    'dealPrice',
    'deal_price',
    'salePrice',
    'sale_price',
    'newPrice',
    'finalPrice',
    'firsatFiyati',
    'indirimliFiyat',
    'price',
    'fiyat',
    'price.value',
    'price.amount',
  ],
  discountPercent: [
    'discountPercent',
    'discount_percent',
    'discountRate',
    'discount_rate',
    'discount',
    'indirim',
    'indirimOrani',
    'percent',
    'savingPercent',
  ],
  currency: ['currency', 'currencyCode', 'paraBirimi', 'price.currency'],
  imageUrl: [
    'imageUrl',
    'image_url',
    'image',
    'img',
    'imageURL',
    'thumbnail',
    'thumb',
    'picture',
    'photo',
    'resim',
    'gorsel',
    'images.0',
    'image.url',
    'media.0.url',
  ],
  imageLargeUrl: ['image1200x1200', 'imageLarge', 'largeImage', 'image_large'],
  sourceUrl: ['showDealUrl', 'url', 'link', 'dealUrl', 'deal_url', 'detailUrl', 'pageUrl', 'href', 'landingUrl', 'permalink', 'adres'],
  affiliateUrl: [
    'affiliateUrl',
    'affiliate_url',
    'trackingUrl',
    'tracking_url',
    'referralUrl',
    'publisherUrl',
    'clickUrl',
    'click_url',
    'deeplink',
    'deepLink',
    'redirectUrl',
  ],
  validFrom: [
    'startDate',
    'start_date',
    'validFrom',
    'valid_from',
    'beginDate',
    'publishDate',
    'baslangicTarihi',
    'saleStart',
    'createdAt',
    'created_at',
  ],
  validUntil: [
    'endDate',
    'end_date',
    'validUntil',
    'valid_until',
    'expireDate',
    'expiryDate',
    'expires',
    'expiresAt',
    'bitisTarihi',
    'sonKullanmaTarihi',
    'saleEnd',
    'deadline',
  ],
  options: ['subDeals', 'options', 'variants', 'packages'],
  conditions: ['conditions', 'terms', 'termsOfUse', 'kosullar', 'kullanimKosullari', 'rules', 'finePrint', 'kurallar'],
  tags: ['tags', 'tag', 'etiketler', 'keywords', 'labels'],
  featured: ['featured', 'isFeatured', 'onecikan', 'highlight'],
  popular: ['popular', 'isPopular', 'populer'],
  isNew: ['isNew', 'new', 'yeni'],
};

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '');
}

/** Read a dotted path ("price.value", "images.0") with case/underscore-insensitive keys. */
export function readPath(record: unknown, path: string): unknown {
  let node: unknown = record;
  for (const segment of path.split('.')) {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) {
      const index = Number(segment);
      node = Number.isInteger(index) ? node[index] : undefined;
      continue;
    }
    if (typeof node !== 'object') return undefined;
    const entries = Object.entries(node as Record<string, unknown>);
    const wanted = normaliseKey(segment);
    const match = entries.find(([key]) => key === segment) ?? entries.find(([key]) => normaliseKey(key) === wanted);
    node = match?.[1];
  }
  return unwrap(node);
}

/** XML parsers turn `<price currency="TRY">10</price>` into {#text, @_currency}. */
function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if ('#text' in object) return object['#text'];
    if ('@_href' in object) return object['@_href'];
    if ('@_url' in object) return object['@_url'];
  }
  return value;
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

export interface MappedRecord {
  input: RawDealInput;
  /** Which source key was used for each field (for the inspection report). */
  usedKeys: Partial<Record<FieldName, string>>;
}

export function mapRecord(record: Record<string, unknown>, explicit: FieldMap = {}): MappedRecord {
  const input: RawDealInput = {};
  const usedKeys: Partial<Record<FieldName, string>> = {};
  for (const field of Object.keys(CANDIDATE_KEYS) as FieldName[]) {
    const pinned = explicit[field];
    const candidates = pinned ? [pinned] : CANDIDATE_KEYS[field];
    for (const key of candidates) {
      const value = readPath(record, key);
      if (isPresent(value)) {
        input[field] = value;
        usedKeys[field] = key;
        break;
      }
    }
  }
  // A lone "price" key is ambiguous only when we also found an original price under the same key.
  if (usedKeys.price && usedKeys.price === usedKeys.originalPrice) delete input.originalPrice;
  return { input, usedKeys };
}

export function parseFieldMap(json: string | undefined): FieldMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: FieldMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (key in CANDIDATE_KEYS && typeof value === 'string' && value.trim()) map[key as FieldName] = value.trim();
    }
    return map;
  } catch {
    return {};
  }
}
