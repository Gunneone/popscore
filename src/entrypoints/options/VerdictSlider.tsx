import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

const MIN = 1;
const MAX = 10;

type Thumb = 'amberAt' | 'greenAt';

export interface VerdictRange {
  amberAt: number;
  greenAt: number;
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -0.1,
  ArrowDown: -0.1,
  ArrowRight: 0.1,
  ArrowUp: 0.1,
  PageDown: -1,
  PageUp: 1,
};

const round = (v: number) => Math.round(Math.min(MAX, Math.max(MIN, v)) * 10) / 10;
const pct = (v: number) => `${((v - MIN) / (MAX - MIN)) * 100}%`;

/** Moves one thumb to `v`, at 0.1 steps, without letting amber pass green. */
function moveThumb(cur: VerdictRange, thumb: Thumb, v: number): VerdictRange {
  const value = round(v);
  return thumb === 'amberAt'
    ? { ...cur, amberAt: Math.min(value, cur.greenAt) }
    : { ...cur, greenAt: Math.max(value, cur.amberAt) };
}

interface Props extends VerdictRange {
  /** Called when a drag ends or key presses settle, not on every step: sync storage has write quotas. */
  onChange(range: VerdictRange): void;
}

/** One 1–10 rail colored red / amber / green, with a thumb on each boundary. */
export function VerdictSlider(props: Props) {
  const fromProps = () => ({ amberAt: round(props.amberAt), greenAt: round(props.greenAt) });
  const [range, setRange] = useState<VerdictRange>(fromProps);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(range);
  const drag = useRef<{ thumb: Thumb | null; offset: number; start: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const rail = useRef<HTMLDivElement>(null);
  const thumbs = { amberAt: useRef<HTMLDivElement>(null), greenAt: useRef<HTMLDivElement>(null) };

  const apply = (next: VerdictRange) => {
    latest.current = next;
    setRange(next);
  };

  // Follow changes from elsewhere (another tab, sync), but not while the user is mid-change.
  useEffect(() => {
    if (!drag.current && !saveTimer.current) apply(fromProps());
  }, [props.amberAt, props.greenAt]);

  const commit = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const { amberAt, greenAt } = latest.current;
    if (amberAt !== props.amberAt || greenAt !== props.greenAt) props.onChange(latest.current);
  };

  const valueAt = (clientX: number) => {
    const r = rail.current!.getBoundingClientRect();
    return MIN + ((clientX - r.left) / r.width) * (MAX - MIN);
  };

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const v = valueAt(e.clientX);
    const cur = latest.current;
    const grabbed = (e.target as HTMLElement).dataset.thumb as Thumb | undefined;
    let thumb: Thumb | null;
    let offset = 0;
    if (grabbed && cur.amberAt === cur.greenAt) {
      // Stacked thumbs: the direction of the drag decides which one moves.
      thumb = null;
      offset = cur.amberAt - v;
    } else if (grabbed) {
      thumb = grabbed;
      offset = cur[grabbed] - v;
    } else {
      const dA = Math.abs(v - cur.amberAt);
      const dG = Math.abs(v - cur.greenAt);
      thumb = dA < dG || (dA === dG && v < cur.amberAt) ? 'amberAt' : 'greenAt';
      apply(moveThumb(cur, thumb, v));
    }
    drag.current = { thumb, offset, start: v };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (thumb) thumbs[thumb].current?.focus();
    setDragging(true);
  };

  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const v = valueAt(e.clientX);
    if (!d.thumb) {
      if (Math.abs(v - d.start) < 0.1) return;
      d.thumb = v < d.start ? 'amberAt' : 'greenAt';
      thumbs[d.thumb].current?.focus();
    }
    apply(moveThumb(latest.current, d.thumb, v + d.offset));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    commit();
  };

  const onKeyDown = (thumb: Thumb) => (e: KeyboardEvent) => {
    const step = KEY_STEPS[e.key];
    const next =
      e.key === 'Home'
        ? MIN
        : e.key === 'End'
          ? MAX
          : step !== undefined
            ? latest.current[thumb] + step * (e.shiftKey ? 10 : 1)
            : null;
    if (next === null) return;
    e.preventDefault();
    apply(moveThumb(latest.current, thumb, next));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(commit, 400);
  };

  const { amberAt, greenAt } = range;
  const thumb = (t: Thumb, label: string, cls: string) => (
    <div
      ref={thumbs[t]}
      class={`thumb ${cls}`}
      data-thumb={t}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={range[t]}
      aria-valuetext={range[t].toFixed(1)}
      onKeyDown={onKeyDown(t)}
      onBlur={() => saveTimer.current && commit()}
    />
  );

  return (
    <div
      class={`verdict${dragging ? ' dragging' : ''}`}
      style={{ '--a': pct(amberAt), '--g': pct(greenAt) }}
    >
      <div class="bubbles" aria-hidden="true">
        <span class="bubble okay">{amberAt.toFixed(1)}</span>
        <span class="bubble good">{greenAt.toFixed(1)}</span>
      </div>
      <div
        class="rail"
        ref={rail}
        onPointerDown={onPointerDown}
        // The browser's own mousedown focus would take focus back off the thumb picked above.
        onMouseDown={(e) => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <div class="bar" />
        {thumb('amberAt', 'Amber from', 'okay')}
        {thumb('greenAt', 'Green from', 'good')}
      </div>
      <div class="ticks" aria-hidden="true">
        {Array.from({ length: MAX - MIN + 1 }, (_, i) => (
          <span key={i} style={{ left: pct(MIN + i) }}>
            {MIN + i}
          </span>
        ))}
      </div>
      <p class="legend small muted">
        <span>
          <i class="bad" />
          Red below {amberAt.toFixed(1)}
        </span>
        {amberAt < greenAt && (
          <span>
            <i class="okay" />
            Amber from {amberAt.toFixed(1)}
          </span>
        )}
        <span>
          <i class="good" />
          Green from {greenAt.toFixed(1)}
        </span>
      </p>
    </div>
  );
}
