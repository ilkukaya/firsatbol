import { XMLParser } from 'fast-xml-parser';

/**
 * Format detection and record extraction for provider responses whose exact schema has
 * not been confirmed yet. We look for the most plausible list of records instead of
 * hard-coding a guessed structure; field mapping happens separately (see `fields.ts`).
 */
export type DetectedFormat = 'json' | 'xml' | 'html' | 'text' | 'unknown';

export function detectFormat(contentType: string, body: string): DetectedFormat {
  const type = contentType.toLowerCase();
  const head = body.trimStart().slice(0, 512).toLowerCase();
  if (type.includes('json') || head.startsWith('{') || head.startsWith('[')) return 'json';
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || (type.includes('text/html') && !head.startsWith('<?xml'))) {
    // Some APIs mislabel XML as text/html; only call it HTML if it looks like a document.
    if (head.startsWith('<?xml') || /^<(rss|feed|deals|items|response|result|root)\b/.test(head)) return 'xml';
    return 'html';
  }
  if (type.includes('xml') || head.startsWith('<?xml') || head.startsWith('<')) return 'xml';
  if (head.length > 0) return 'text';
  return 'unknown';
}

const PREFERRED_LIST_KEYS = [
  'deals',
  'deal',
  'items',
  'item',
  'data',
  'results',
  'result',
  'list',
  'records',
  'firsatlar',
  'firsat',
  'products',
  'product',
  'offers',
  'offer',
  'events',
  'event',
  'entry',
];

type Json = unknown;

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeRecordList(value: Json): value is Record<string, Json>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRecord);
}

/**
 * Find the array of record objects inside an arbitrary JSON/XML-derived tree.
 * Preference: root array → well-known keys → largest array of objects (depth ≤ 4).
 */
export function extractRecords(tree: Json): { records: Record<string, Json>[]; path: string } {
  if (looksLikeRecordList(tree)) return { records: tree, path: '$' };
  let best: { records: Record<string, Json>[]; path: string; score: number } | null = null;
  const visit = (node: Json, path: string, depth: number) => {
    if (depth > 4 || !isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      const preferred = PREFERRED_LIST_KEYS.includes(key.toLowerCase());
      if (looksLikeRecordList(value)) {
        const score = value.length + (preferred ? 1_000 : 0);
        if (!best || score > best.score) best = { records: value, path: childPath, score };
      } else if (preferred && isRecord(value) && depth < 4) {
        // XML with a single child element parses to an object, not an array
        const inner = Object.values(value);
        const hasNestedList = inner.some((child) => looksLikeRecordList(child) || isRecord(child));
        if (!hasNestedList || Object.keys(value).length > 3) {
          const score = 1 + 500;
          if (!best || score > best.score) best = { records: [value], path: childPath, score };
        }
      }
      visit(value, childPath, depth + 1);
    }
  };
  visit(tree, '$', 0);
  const found = best as { records: Record<string, Json>[]; path: string } | null;
  return found ? { records: found.records, path: found.path } : { records: [], path: '' };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: false,
  parseTagValue: false, // keep values as strings; we parse prices/dates ourselves
  trimValues: true,
  processEntities: true,
});

export function parseBody(format: DetectedFormat, body: string): Json {
  if (format === 'json') return JSON.parse(body) as Json;
  if (format === 'xml') return xmlParser.parse(body) as Json;
  throw new Error(`Desteklenmeyen yanıt biçimi: ${format}`);
}

/** Top-level structure summary for the inspection script (keys and types only). */
export function describeShape(value: Json, depth = 0, maxDepth = 3): Json {
  if (Array.isArray(value)) {
    return depth >= maxDepth
      ? `array(${value.length})`
      : [`array(${value.length})`, value.length ? describeShape(value[0], depth + 1, maxDepth) : null];
  }
  if (isRecord(value)) {
    if (depth >= maxDepth) return `object(${Object.keys(value).length} keys)`;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, describeShape(child, depth + 1, maxDepth)]));
  }
  return value === null ? 'null' : typeof value;
}
