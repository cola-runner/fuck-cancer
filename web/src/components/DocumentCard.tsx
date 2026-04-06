import type React from 'react';
import type { Document } from '../pages/CaseDetailPage';

interface DocumentCardProps {
  document: Document;
}

// Category left-border colors per Stripe design spec
const categoryBorderColor: Record<string, string> = {
  // blood test / lab
  检查报告: '#ea2261',
  // imaging
  影像资料: '#059669',
  // prescription / medication
  处方: '#15be53',
  // pathology / note / recording
  病理: '#f59e0b',
  // other
  其他: '#e5edf5',
};

function getCategoryBorderColor(category: string): string {
  return categoryBorderColor[category] ?? '#e5edf5';
}

const fileTypeIcons: Record<string, React.ReactNode> = {
  pdf: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ color: '#ea2261' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  image: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ color: '#059669' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M2.25 18V6a2.25 2.25 0 0 1 2.25-2.25h15A2.25 2.25 0 0 1 21.75 6v12A2.25 2.25 0 0 1 19.5 20.25H4.5A2.25 2.25 0 0 1 2.25 18Z" />
    </svg>
  ),
  text: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ color: '#64748d' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
};

function getFileIcon(mimeType?: string, filename?: string) {
  if (mimeType?.startsWith('image/') || filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return fileTypeIcons.image;
  }
  if (mimeType === 'application/pdf' || filename?.endsWith('.pdf')) {
    return fileTypeIcons.pdf;
  }
  return fileTypeIcons.text;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DocumentCard({ document: doc }: DocumentCardProps) {
  const leftBorderColor = getCategoryBorderColor(doc.category);

  return (
    <div
      className="flex overflow-hidden cursor-pointer group transition-all duration-200"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5edf5',
        borderRadius: '6px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Category left border indicator */}
      <div
        className="flex-shrink-0"
        style={{
          width: '3px',
          backgroundColor: leftBorderColor,
          borderRadius: '6px 0 0 6px',
        }}
      />

      <div className="flex gap-4 flex-1 p-4">
        {/* Thumbnail / Icon */}
        <div className="flex-shrink-0">
          {doc.thumbnailUrl ? (
            <img
              src={doc.thumbnailUrl}
              alt=""
              className="w-12 h-12 object-cover"
              style={{ borderRadius: '6px', backgroundColor: '#f8fafc' }}
            />
          ) : (
            <div
              className="w-12 h-12 flex items-center justify-center"
              style={{ backgroundColor: '#f8fafc', borderRadius: '6px' }}
            >
              {getFileIcon(doc.mimeType, doc.filename)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h4
              className="truncate transition-colors"
              style={{ fontSize: '15px', fontWeight: 500, color: '#061b31' }}
            >
              {doc.filename}
            </h4>
            <span
              className="flex-shrink-0 text-right"
              style={{ fontSize: '12px', color: '#64748d' }}
            >
              {formatDate(doc.date)}
            </span>
          </div>
          {doc.summary && (
            <p
              className="mt-1 line-clamp-2"
              style={{ fontSize: '13px', color: '#64748d', lineHeight: 1.5 }}
            >
              {doc.summary}
            </p>
          )}
          {doc.category && (
            <span
              className="inline-block mt-2"
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: leftBorderColor === '#e5edf5' ? '#64748d' : leftBorderColor,
                backgroundColor: leftBorderColor === '#e5edf5'
                  ? 'rgba(100,116,141,0.08)'
                  : `${leftBorderColor}14`,
                borderRadius: '4px',
                padding: '2px 8px',
              }}
            >
              {doc.category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
