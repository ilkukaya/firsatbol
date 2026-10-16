/**
 * Inspect the real Fırsat Bu Fırsat API response with YOUR credentials, locally:
 *
 *   FIRSATBUFIRSAT_API_KEY=… FIRSATBUFIRSAT_PUBLISHER_ID=… npm run provider:inspect
 *   (or put them in .env — never commit it)
 *
 * Prints the detected format, the record path, the keys of the first records, which keys the
 * mapper used for each field, and how many records normalise successfully. The raw response is
 * saved to .cache/ (git-ignored) so you can build a field map or a test fixture from it.
 * Secrets are redacted from everything printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildRequestUrl, readFbfConfig, transformResponse } from '../src/lib/providers/firsatbufirsat';
import { mapRecord } from '../src/lib/providers/fields';
import { fetchText, redactUrl } from '../src/lib/providers/http';
import { describeShape, detectFormat, extractRecords, parseBody } from '../src/lib/providers/parse';

try {
  process.loadEnvFile?.('.env');
} catch {
  /* optional */
}

const variant = process.argv.includes('--events') ? 'events' : 'deals';
const config = readFbfConfig(variant);
if (!config.apiKey || !config.publisherId || !config.endpoint) {
  console.error('FIRSATBUFIRSAT_API_KEY ve FIRSATBUFIRSAT_PUBLISHER_ID (etkinlik için FIRSATBUFIRSAT_EVENTS_API_URL) gerekli.');
  process.exit(1);
}
const secrets = [config.apiKey, config.publisherId];
const redact = (text: string) => secrets.reduce((value, secret) => value.split(secret).join('***'), text);

const url = buildRequestUrl(config, undefined, config.pageParam ? config.pageStart : null);
console.log(`İstek: ${redactUrl(url, secrets)}`);
const response = await fetchText(url, redactUrl(url, secrets), { ...config.policy, retries: 0 });
const format = detectFormat(response.contentType, response.body);
console.log(`HTTP ${response.status} · content-type: ${response.contentType || '(yok)'} · ${response.body.length} bayt · biçim: ${format}`);

mkdirSync('.cache', { recursive: true });
const file = `.cache/firsatbufirsat-${variant}-${Date.now()}.${format === 'json' ? 'json' : format === 'xml' ? 'xml' : 'txt'}`;
writeFileSync(file, redact(response.body));
console.log(`Ham yanıt (gizli değerler maskelendi): ${file}`);

if (format !== 'json' && format !== 'xml') {
  console.log('\nYanıt JSON/XML değil. İlk 600 karakter:\n');
  console.log(redact(response.body.slice(0, 600)));
  process.exit(0);
}

const tree = parseBody(format, response.body);
console.log('\nYapı (anahtarlar ve türler):');
console.log(JSON.stringify(describeShape(tree), null, 2).slice(0, 3000));
const { records, path } = extractRecords(tree);
console.log(`\nKayıt listesi: ${path || '(bulunamadı)'} · ${records.length} kayıt`);
for (const record of records.slice(0, 2)) {
  console.log(`\nÖrnek kayıt anahtarları: ${Object.keys(record).join(', ')}`);
  console.log('Eşleşen alanlar:', JSON.stringify(mapRecord(record, config.fieldMap).usedKeys));
}
const result = transformResponse(response.body, response.contentType, config, new Date());
console.log(`\nNormalize: kabul=${result.deals.length} süresi-dolmuş=${result.expired} red=${JSON.stringify(result.rejectReasons)}`);
const sample = result.deals[0];
if (sample) {
  console.log('\nİlk normalize fırsat:');
  console.log(redact(JSON.stringify({ ...sample, description: sample.description?.slice(0, 160) }, null, 2)));
}
console.log('\nSonraki adım: alanlar yanlış eşleşiyorsa FIRSATBUFIRSAT_FIELD_MAP ile sabitleyin (docs/PROVIDERS.md).');
