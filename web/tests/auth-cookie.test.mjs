import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiSource = await readFile(
  new URL('../src/lib/api.ts', import.meta.url),
  'utf8',
);
const authSource = await readFile(
  new URL('../src/lib/auth.tsx', import.meta.url),
  'utf8',
);
const callbackSource = await readFile(
  new URL('../src/pages/AuthCallbackPage.tsx', import.meta.url),
  'utf8',
);

test('API requests use cookies without reading or attaching bearer tokens', () => {
  assert.match(apiSource, /withCredentials:\s*true/);
  assert.doesNotMatch(apiSource, /localStorage/);
  assert.doesNotMatch(apiSource, /Authorization/);
});

test('auth state is restored from the session cookie and logout clears it server-side', () => {
  assert.doesNotMatch(authSource, /localStorage/);
  assert.match(authSource, /login:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(authSource, /logout:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(authSource, /api\.get\(['"]\/auth\/me['"]\)/);
  assert.match(authSource, /api\.post\(['"]\/auth\/logout['"]\)/);
});

test('OAuth callback completes login from the HttpOnly cookie without a URL token', () => {
  assert.doesNotMatch(callbackSource, /useSearchParams|searchParams|token/i);
  assert.match(callbackSource, /\blogin\(\)/);
});
