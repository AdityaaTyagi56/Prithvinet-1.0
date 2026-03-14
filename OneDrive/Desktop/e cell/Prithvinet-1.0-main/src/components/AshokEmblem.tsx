import React from 'react';

const EMBLEM_URL = 'https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg';

/** National Emblem of India — rendered as an <img> from Wikimedia Commons */
export function AshokEmblem({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={EMBLEM_URL}
      alt="National Emblem of India — Satyameva Jayate"
      width={size}
      height={size * 1.1}
      className={className}
      style={{ objectFit: 'contain' }}
      loading="eager"
    />
  );
}
