import assert from 'node:assert/strict';
import test from 'node:test';

type SourceLabelInput = {
  sourceAuthority?: 'official' | 'medical' | 'web' | 'user' | null;
  origin: 'research' | 'auto' | null;
  sourceUrl: string | null;
};

type SourceLabelModule = {
  getSourceLabel: (source: SourceLabelInput) => string;
};

async function loadSourceLabelModule(): Promise<Partial<SourceLabelModule>> {
  try {
    return await import('../src/lib/source-label.ts');
  } catch {
    return {};
  }
}

test('maps explicit source authority to its truthful label', async () => {
  const { getSourceLabel } = await loadSourceLabelModule();
  const base = { origin: 'research' as const, sourceUrl: 'https://example.com' };

  assert.deepEqual(
    [
      getSourceLabel?.({ ...base, sourceAuthority: 'official' }),
      getSourceLabel?.({ ...base, sourceAuthority: 'medical' }),
      getSourceLabel?.({ ...base, sourceAuthority: 'web' }),
      getSourceLabel?.({ ...base, sourceAuthority: 'user' }),
    ],
    ['官方来源', '医学来源', '网络资料', '个人病历'],
  );
});

test('labels a research report independently from web authority', async () => {
  const { getSourceLabel } = await loadSourceLabelModule();

  assert.equal(
    getSourceLabel?.({
      sourceAuthority: 'web',
      origin: 'research',
      sourceUrl: null,
    }),
    '研究报告',
  );
});

test('defaults an imported source without authority metadata to network material', async () => {
  const { getSourceLabel } = await loadSourceLabelModule();

  assert.equal(
    getSourceLabel?.({
      origin: 'auto',
      sourceUrl: 'https://example.com/article',
    }),
    '网络资料',
  );
});

test('defaults a user upload without authority metadata to a personal record', async () => {
  const { getSourceLabel } = await loadSourceLabelModule();

  assert.equal(
    getSourceLabel?.({
      origin: null,
      sourceUrl: null,
    }),
    '个人病历',
  );
});
