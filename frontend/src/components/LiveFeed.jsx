import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, VideoOff } from 'lucide-react';

function normalizeBBox(bbox) {
  if (!bbox) return null;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [x1, y1, x2, y2] = bbox;
    return [Number(x1), Number(y1), Number(x2), Number(y2)];
  }
  if (typeof bbox === 'object') {
    const { x1, y1, x2, y2 } = bbox;
    return [Number(x1), Number(y1), Number(x2), Number(y2)];
  }
  return null;
}

export default function LiveFeed({ cameraId, zoneName, url, status, detections = [], frameSize = null, frameSrc = '' }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const isOnline = status === 'online';
  const displaySrc = useMemo(() => {
    if (!frameSrc) return '';
    return frameSrc.startsWith('data:image') ? frameSrc : `data:image/jpeg;base64,${frameSrc}`;
  }, [frameSrc]);

  const feedUrl = useMemo(() => url || '', [url]);
  const trackPreview = useMemo(
    () =>
      detections
        .filter((item) => item && item.track_id !== undefined && item.track_id !== null)
        .slice(0, 4),
    [detections]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const resizeCanvas = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr));

      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(wrapper);

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const sourceWidth = frameSize?.width || 1280;
    const sourceHeight = frameSize?.height || 720;
    const scaleX = width / sourceWidth;
    const scaleY = height / sourceHeight;
    ctx.font = '12px sans-serif';
    ctx.lineWidth = 2;
    ctx.textBaseline = 'top';

    detections.forEach((box) => {
      const normalized = normalizeBBox(box.bbox);
      if (!normalized) return;
      const [x1, y1, x2, y2] = normalized;
      const className = String(box.class_name || box.object_class || 'object');
      const color = box.type === 'alert'
        ? '#ef4444'
        : box.is_carrying || box.is_carried
          ? '#fbbf24'
        : className === 'cart'
          ? '#3b82f6'
        : className === 'basket' || className === 'bottle'
          ? '#f59e0b'
          : '#22c55e';

      const scaledX = x1 * scaleX;
      const scaledY = y1 * scaleY;
      const scaledW = (x2 - x1) * scaleX;
      const scaledH = (y2 - y1) * scaleY;

      ctx.strokeStyle = color;
      ctx.strokeRect(scaledX, scaledY, scaledW, scaledH);

      let label = `#${box.track_id || '-'} ${className} ${Math.round((box.confidence || 0) * 100)}%`;
      if (box.is_carrying && box.carry_summary) {
        label = `${label} [${box.carry_summary}]`;
      }
      if (box.is_carried && box.carried_by_track_id !== undefined && box.carried_by_track_id !== null) {
        label = `${label} -> #${box.carried_by_track_id}`;
      }
      const paddingX = 6;
      const labelHeight = 18;
      const labelWidth = ctx.measureText(label).width + paddingX * 2;
      const labelX = Math.max(0, Math.min(width - labelWidth - 2, scaledX));
      const labelY = Math.max(0, scaledY - labelHeight - 2);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = color;
      ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
      ctx.fillStyle = color;
      ctx.fillText(label, labelX + paddingX, labelY + 2);
    });

    return () => observer.disconnect();
  }, [detections, frameSize]);

  return (
    <div ref={wrapperRef} className="group relative aspect-video overflow-hidden rounded-[1.35rem] border border-cyan-500/15 bg-[#09111b] shadow-[0_20px_80px_rgba(0,0,0,0.32)]">
      {displaySrc ? (
        <img
          id="liveFrame"
          src={displaySrc}
          alt={`camera-${cameraId}`}
          className="absolute inset-0 z-0 h-full w-full object-cover"
          onError={() => setLoadFailed(true)}
          onLoad={() => setLoadFailed(false)}
        />
      ) : isOnline && !loadFailed ? (
        <iframe
          src={feedUrl}
          className="absolute left-0 top-1/2 z-0 h-[114%] w-full -translate-y-1/2 border-0"
          allowFullScreen
          scrolling="no"
          title={`camera-${cameraId}`}
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <div className="relative z-0 flex h-full w-full flex-col items-center justify-center bg-gray-900/90 text-gray-500">
          <VideoOff className="mb-2 h-10 w-10 opacity-50" />
          <span className="text-sm font-medium">{isOnline ? 'Stream unavailable' : 'Camera Offline'}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#03070e]/85 via-[#03070e]/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-[#03070e]/90 via-[#03070e]/35 to-transparent" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-white/10 bg-[#08111c]/85 px-3 py-2 text-sm text-white backdrop-blur">
        <span className="max-w-[190px] truncate font-semibold tracking-[0.08em] text-slate-100">{zoneName}</span>
        {feedUrl && (
          <a href={feedUrl} target="_blank" rel="noreferrer" className="pointer-events-auto text-white/70 transition hover:text-white">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="absolute right-3 top-3 z-30 flex items-center rounded-xl border border-white/10 bg-[#08111c]/85 px-3 py-2 text-sm text-white backdrop-blur">
        <div className={`mr-2 h-2.5 w-2.5 rounded-full ${isOnline && !loadFailed ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'}`} />
        {isOnline && !loadFailed ? 'Live' : 'Offline'}
      </div>

      <div className="absolute bottom-3 left-3 right-3 z-30 flex items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {trackPreview.map((item) => (
            <span
              key={`${cameraId}-${item.track_id}-${item.class_name || item.object_class}`}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur ${
                item.is_carrying || item.is_carried
                  ? 'border-amber-500/30 bg-[#07111b]/90 text-amber-300'
                  : 'border-emerald-500/25 bg-[#07111b]/90 text-emerald-300'
              }`}
            >
              {String(item.class_name || item.object_class || 'object').toUpperCase()} #{item.track_id}
              {item.is_carrying && item.carry_summary ? ` - ${String(item.carry_summary).toUpperCase()}` : ''}
            </span>
          ))}
          {trackPreview.length === 0 ? (
            <span className="rounded-full border border-slate-700 bg-[#07111b]/90 px-2.5 py-1 text-[11px] font-semibold text-slate-400 backdrop-blur">
              NO ACTIVE TRACKS
            </span>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#08111c]/85 px-3 py-2 text-right backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Feed</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{String(cameraId || '').slice(0, 8) || '--'}</div>
        </div>
      </div>
    </div>
  );
}
