import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  Logo: ({ size = 30 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" rx="8" fill="var(--accent)" />
      <path d="M7 19l5-6 4 4 7-8" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Table: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </Svg>
  ),
  Chart: (p: P) => (
    <Svg {...p}>
      <path d="M4 19.5h16" />
      <path d="M5 15l4.5-5 3.5 3.5L19.5 7" />
    </Svg>
  ),
  Search: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  ),
  Film: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </Svg>
  ),
  Target: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Svg>
  ),
  Trend: (p: P) => (
    <Svg {...p}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Svg>
  ),
  Sliders: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Svg>
  ),
  Clock: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  ),
  Plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Send: (p: P) => (
    <Svg {...p} strokeWidth={2.4}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  ),
  Stop: (p: P) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
    </svg>
  ),
  Clip: (p: P) => (
    <Svg {...p}>
      <path d="M20 11.5l-8 8a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.4 8.4a1.7 1.7 0 01-2.4-2.4L15 7" />
    </Svg>
  ),
  Check: (p: P) => (
    <Svg {...p} strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  ),
  X: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Alert: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4M12 17.2v.3" />
    </Svg>
  ),
  Sparkle: ({ size = 14, color = 'var(--accent-text)' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={color}>
      <path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z" />
    </svg>
  ),
  Download: (p: P) => (
    <Svg {...p}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  ),
  Copy: (p: P) => (
    <Svg {...p}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
    </Svg>
  ),
  External: (p: P) => (
    <Svg {...p}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </Svg>
  ),
  Play: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  ),
  Music: (p: P) => (
    <Svg {...p}>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </Svg>
  ),
  Calendar: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  ),
  Folder: (p: P) => (
    <Svg {...p}>
      <path d="M3.5 7a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2V17a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
    </Svg>
  ),
  Trash: (p: P) => (
    <Svg {...p}>
      <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
    </Svg>
  ),
  ArrowRight: (p: P) => (
    <Svg {...p} strokeWidth={2.4}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  Chevron: (p: P) => (
    <Svg {...p}>
      <path d="M8 10l4 4 4-4" />
    </Svg>
  ),
  Globe: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
    </Svg>
  ),
  Moon: (p: P) => (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
    </Svg>
  ),
  Sun: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </Svg>
  ),
  Monitor: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </Svg>
  ),
};
