import type { Config } from '@netlify/functions';
import { z } from 'zod';
import { readEnv, readInt } from '../../src/lib/env';
import { json } from '../shared/auth';

/**
 * POST /api/newsletter — double opt-in subscription via Brevo.
 * Requires BREVO_API_KEY, BREVO_LIST_ID and BREVO_DOI_TEMPLATE_ID (a Brevo "double opt-in"
 * template). The contact is only added to the list after clicking the confirmation email.
 * Consent for commercial e-messages must be explicitly given (checkbox) — we refuse otherwise.
 */
const bodySchema = z.object({
  email: z.email().max(200),
  consent: z.literal(true),
  website: z.string().max(0).optional(), // honeypot must stay empty
});

export default async (req: Request) => {
  const apiKey = readEnv('BREVO_API_KEY');
  const listId = readInt('BREVO_LIST_ID', 0);
  const templateId = readInt('BREVO_DOI_TEMPLATE_ID', 0);
  if (!apiKey || !listId || !templateId) {
    return json({ message: 'Bülten aboneliği şu anda etkin değil.' }, 503);
  }
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return json({ message: 'Geçersiz istek.' }, 400);
  }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) {
    return json({ message: 'Lütfen geçerli bir e-posta adresi yazın ve ticari ileti onayını işaretleyin.' }, 400);
  }
  const site = (readEnv('SITE_URL') ?? readEnv('URL') ?? 'https://firsatbol.com').replace(/\/+$/, '');
  const response = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      email: parsed.data.email.toLowerCase(),
      includeListIds: [listId],
      templateId,
      redirectionUrl: readEnv('BREVO_REDIRECT_URL') ?? `${site}/bulten/onay/`,
    }),
  });
  if (response.ok) {
    return json({ message: 'Onay e-postası gönderildi. Aboneliği tamamlamak için e-postanızdaki bağlantıya tıklayın.' }, 201);
  }
  console.error('[newsletter] Brevo HTTP', response.status);
  return json({ message: 'Şu anda abonelik alınamıyor, lütfen daha sonra tekrar deneyin.' }, 502);
};

export const config: Config = {
  path: '/api/newsletter',
  method: 'POST',
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
