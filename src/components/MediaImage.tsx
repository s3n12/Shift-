import { useState } from 'react';
import { Compass } from 'lucide-react';

interface MediaImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function MediaImage({
  src,
  alt,
  className = '',
  fallbackLabel,
}: MediaImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#EFE9E0] via-[#E6DDD1] to-[#D8DDD8] text-[#4A6B5D] ${className}`}
        role="img"
        aria-label={alt}
      >
        <Compass className="w-8 h-8 opacity-60 mb-2" strokeWidth={1.5} />
        {fallbackLabel && (
          <span className="text-xs font-medium tracking-wide opacity-80">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
