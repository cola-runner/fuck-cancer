export type SourceAuthority = 'official' | 'medical' | 'web' | 'user';
export type SourceOrigin = 'research' | 'auto' | null;

export interface SourceLabelInput {
  sourceAuthority?: SourceAuthority | null;
  origin: SourceOrigin;
  sourceUrl: string | null;
}

const AUTHORITY_LABELS: Record<SourceAuthority, string> = {
  official: '官方来源',
  medical: '医学来源',
  web: '网络资料',
  user: '个人病历',
};

export function getSourceLabel(source: SourceLabelInput): string {
  if (source.origin === 'research' && source.sourceUrl === null) {
    return '研究报告';
  }
  if (source.sourceAuthority) {
    return AUTHORITY_LABELS[source.sourceAuthority];
  }
  return source.origin === null ? '个人病历' : '网络资料';
}
