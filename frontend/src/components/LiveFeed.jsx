import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VideoOff } from 'lucide-react';

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
    <div ref={wrapperRef} className="group relative aspect-video overflow-hidden rounded-[1rem] border border-cyan-500/15 bg-[#09111b] shadow-[0_20px_80px_rgba(0,0,0,0.32)] sm:rounded-[1.15rem]">
      {displaySrc ? (
        <img
          id="liveFrame"
          src={displaySrc}
          alt={`camera-${cameraId}`}
          className="absolute inset-0 z-0 h-full w-full object-contain"
          onError={() => setLoadFailed(true)}
          onLoad={() => setLoadFailed(false)}
        />
      ) : isOnline && !loadFailed ? (
        <iframe
          src={feedUrl}
          className="absolute inset-0 z-0 h-full w-full border-0"
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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-[#03070e]/78 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-[#03070e]/72 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-10 ring-1 ring-inset ring-white/6" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />
    </div>
  );
}
