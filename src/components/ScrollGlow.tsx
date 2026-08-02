import { useEffect, useState } from 'react';

export default function ScrollGlow() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? window.scrollY / scrollable : 0;
      setProgress(pct);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-0 h-[55vh] transition-[top] duration-300 ease-out"
      style={{
        top: `${progress * 100}%`,
        background:
          'radial-gradient(50% 50% at 50% 50%, rgba(245,158,11,0.08) 0%, transparent 70%)',
      }}
    />
  );
}
