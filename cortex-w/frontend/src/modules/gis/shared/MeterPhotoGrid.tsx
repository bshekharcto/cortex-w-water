import { useState } from 'react';
import { X, RefreshCw, Image as ImageIcon } from 'lucide-react';

export interface PhotoItem {
  name: string;
  category: string;
  url: string;
  uploadDate?: string;
}

interface MeterPhotoGridProps {
  photos: PhotoItem[];
  /** loading: the list is on its way; error: it could not be loaded; done: `photos` is the answer (possibly empty). */
  state: 'loading' | 'error' | 'done';
  onRetry?: () => void;
  emptyText?: string;
}

/**
 * The installation-proof pictures of a meter with a click-to-enlarge view: one component for Meter 360 and for the
 * Household 360 hardware tab, so the two always look and behave the same. The pictures are only downloaded once this is
 * on screen (lazy images), and the page decides when to ask for the list.
 */
export function MeterPhotoGrid({ photos, state, onRetry, emptyText = 'No proof photos uploaded for this meter.' }: MeterPhotoGridProps) {
  const [preview, setPreview] = useState<PhotoItem | null>(null);

  if (state === 'loading') {
    return (
      <div style={{ padding: '16px 8px', textAlign: 'center', color: '#64748B', fontSize: 12 }}>
        <RefreshCw size={16} className="gis-spin" style={{ margin: '0 auto 6px auto', display: 'block' }} />
        <span>Loading photos…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div style={{ padding: '16px 8px', textAlign: 'center', color: '#B45309', fontSize: 12 }}>
        <span>Could not load the photos. </span>
        {onRetry && (
          <button className="gis-layer-btn" onClick={onRetry} style={{ marginLeft: 6 }}>
            Retry
          </button>
        )}
      </div>
    );
  }
  if (photos.length === 0) {
    return (
      <div style={{ padding: '16px 8px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
        <ImageIcon size={24} style={{ margin: '0 auto 6px auto', display: 'block', opacity: 0.5 }} />
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <>
      <div className="gis-photo-grid">
        {photos.map((photo, i) => (
          <div key={`${photo.url}-${i}`} className="gis-photo-card" onClick={() => setPreview(photo)}>
            <img
              src={photo.url}
              alt={photo.name}
              className="gis-photo-thumb"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="gis-photo-info">
              <span className="gis-photo-category">{photo.category.replace(/_/g, ' ')}</span>
              {photo.uploadDate && <span className="gis-photo-date">{photo.uploadDate.split('T')[0]}</span>}
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div className="gis-modal-backdrop" onClick={() => setPreview(null)}>
          <div className="gis-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="gis-modal-close-btn" onClick={() => setPreview(null)}>
              <X size={18} />
            </button>
            <img src={preview.url} alt={preview.name} className="gis-modal-image" />
            <div className="gis-modal-caption">
              <span>
                <strong>{preview.category.replace(/_/g, ' ')}</strong> · {preview.name}
              </span>
              <a href={preview.url} target="_blank" rel="noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline', fontSize: 11 }}>
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
