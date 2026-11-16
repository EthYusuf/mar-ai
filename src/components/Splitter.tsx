import { useRef, useState } from 'react';
import { useT } from '../i18n';

/** Sohbet ile rapor alanı arasındaki sürüklenebilir ayraç (klavye ile de ayarlanabilir). */
export function Splitter({ width, side, onChange, onCommit }: { width: number; side: 'left' | 'right'; onChange: (w: number) => void; onCommit: (w: number) => void }) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: width });
  const latest = useRef(width);
  const clamp = (w: number) => Math.round(Math.min(Math.max(w, 300), Math.min(900, window.innerWidth - 440)));

  return (
    <button
      type="button"
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={300}
      aria-valuemax={900}
      aria-label={t.dragToResize}
      title={t.dragToResize}
      data-dragging={dragging}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const dx = e.clientX - start.current.x;
        latest.current = clamp(start.current.w + (side === 'left' ? dx : -dx));
        onChange(latest.current);
      }}
      onPointerUp={() => {
        if (!dragging) return;
        setDragging(false);
        onCommit(latest.current);
      }}
      onDoubleClick={() => {
        onChange(400);
        onCommit(400);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 60 : 20;
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const w = clamp(width + (side === 'left' ? dir : -dir) * step);
        onChange(w);
        onCommit(w);
      }}
    />
  );
}
