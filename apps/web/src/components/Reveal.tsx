import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** Progressive enhancement: content remains visible without observation or with reduced motion. */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || preference.matches || !('IntersectionObserver' in window)) return;
    element.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          element.dataset.reveal = 'visible';
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' },
    );
    observer.observe(element);
    const show = () => {
      if (preference.matches) {
        element.dataset.reveal = 'visible';
        observer.disconnect();
      }
    };
    preference.addEventListener('change', show);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', show);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={'reveal ' + className}
      style={{ '--reveal-delay': delay + 'ms' } as CSSProperties}
    >
      {children}
    </div>
  );
}
