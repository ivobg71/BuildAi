'use client';

import { useEffect, useState } from 'react';

type PhotoItem = {
  name: string;
  size: number;
  url: string;
};

type Props = {
  files: File[];
  label?: string;
  compact?: boolean;
};

export default function PhotoGallery({ files, label = 'Снимка', compact = false }: Props) {
  const [items, setItems] = useState<PhotoItem[]>([]);

  useEffect(() => {
    const next = files.map(file => ({ name: file.name, size: file.size, url: URL.createObjectURL(file) }));
    setItems(next);
    return () => next.forEach(item => URL.revokeObjectURL(item.url));
  }, [files]);

  if (!files.length) return null;

  return (
    <div className={`photo-gallery ${compact ? 'photo-gallery-compact' : ''}`}>
      {items.map((item, index) => (
        <a className="photo-gallery-item" href={item.url} target="_blank" rel="noreferrer" key={`${item.name}-${index}-${item.url}`} aria-label={`Отвори ${label} ${index + 1}`}>
          <img src={item.url} alt={`${label} ${index + 1}: ${item.name}`} />
          <span className="photo-gallery-caption">
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <small>{item.name}</small>
            <em>{(item.size / 1024 / 1024).toFixed(2)} MB</em>
          </span>
        </a>
      ))}
    </div>
  );
}
