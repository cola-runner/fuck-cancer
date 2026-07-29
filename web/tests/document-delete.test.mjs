import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardSource = await readFile(
  new URL('../src/components/DocumentCard.tsx', import.meta.url),
  'utf8',
);
const casePageSource = await readFile(
  new URL('../src/pages/CaseDetailPage.tsx', import.meta.url),
  'utf8',
);

test('document cards expose an explicit delete action', () => {
  assert.match(cardSource, /onDelete/);
  assert.match(cardSource, /['"]删除['"]/);
});

test('ready automatic sources stay managed, while interrupted processing can recover', () => {
  assert.match(
    cardSource,
    /d\.origin === ['"]auto['"][\s\S]*d\.sourceStatus === ['"]ready['"]/,
  );
  assert.match(cardSource, /isAuto && d\.sourceStatus === ['"]processing['"]/);
});

test('local document state changes only after the remote delete succeeds', () => {
  const handlerStart = casePageSource.indexOf('const handleDeleteDoc');
  const handlerEnd = casePageSource.indexOf('const byNewest', handlerStart);
  const handler = casePageSource.slice(handlerStart, handlerEnd);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  assert.match(handler, /await api\.delete\(`\/documents\/\$\{documentId\}`\)/);
  assert.ok(
    handler.indexOf('await api.delete') < handler.indexOf('setDocuments'),
    'the card must remain until NotebookLM confirms deletion',
  );
});

test('a failed remote delete keeps the card and surfaces a retryable error', () => {
  assert.match(casePageSource, /删除失败，资料仍在，可重试/);
  assert.match(cardSource, /role="alert"/);
});
