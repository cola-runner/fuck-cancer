import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chatSource = await readFile(
  new URL('../src/pages/ChatPage.tsx', import.meta.url),
  'utf8',
);

test('failed fail-closed requests remove the optimistic message and restore input', () => {
  assert.match(
    chatSource,
    /filter\(\(message\) => message\.id !== userMessage\.id\)/,
  );
  assert.match(chatSource, /setInput\(trimmed\)/);
  assert.doesNotMatch(chatSource, /id: `error-\$\{Date\.now\(\)\}`/);
});

test('the server recovery message is shown as an alert', () => {
  assert.match(chatSource, /response\?\.data\?\.error/);
  assert.match(chatSource, /role="alert"/);
});
