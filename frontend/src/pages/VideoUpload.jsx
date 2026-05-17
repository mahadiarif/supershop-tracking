import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCameras, uploadVideo } from '../api/client';

const ALLOWED = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska', 'video/webm'];

export default function VideoUpload() {
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('demo');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | uploading | started | error
  const [error, setError] = useState('');
  const fileRef = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    getCameras()
      .then((r) => {
        const list = r.data?.cameras ?? r.data ?? [];
        setCameras(list);
      })
      .catch(() => {});
  }, []);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      setError('Unsupported format. Use MP4, AVI, MOV, MKV, or WebM.');
      return;
    }
    setError('');
    setFile(f);
    setStatus('idle');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    const fd = new FormData();
    fd.append('camera_id', cameraId);
    fd.append('file', file);

    setStatus('uploading');
    setProgress(0);
    setError('');

    try {
      await uploadVideo(fd, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setStatus('started');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed.');
      setStatus('error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-black tracking-wide text-cyan-200">Video Upload — Demo Mode</h1>
        <p className="mt-1 text-xs text-slate-400">
          Upload a video to stream detections live on the Dashboard. Acts as a demo camera until real cameras are connected.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-cyan-500/15 bg-[#0b1929] p-5"
      >
        {/* Camera select */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">
            Target Camera
          </label>
          <select
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="demo">Demo Camera (auto-created)</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            "Demo Camera" will appear on Dashboard automatically.
          </p>
        </div>

        {/* File picker */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">
            Video File
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/50 py-8 transition hover:border-cyan-500/50 hover:bg-slate-900"
          >
            {file ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-cyan-300">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-slate-400">Click to select video</p>
                <p className="mt-1 text-xs text-slate-500">MP4, AVI, MOV, MKV, WebM — max 500 MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/avi,video/quicktime,video/x-matroska,video/webm,.mp4,.avi,.mov,.mkv,.webm"
            onChange={handleFile}
            className="hidden"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        {status === 'uploading' && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === 'started' && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Video processing started. Redirecting to Dashboard…
          </div>
        )}

        <button
          type="submit"
          disabled={!file || status === 'uploading' || status === 'started'}
          className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'uploading' ? 'Uploading…' : status === 'started' ? 'Processing on Dashboard…' : 'Upload & Stream to Dashboard'}
        </button>
      </form>

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4 text-xs text-slate-400 space-y-1">
        <p className="font-bold text-slate-300">How it works:</p>
        <p>1. Upload video → server processes frames in background</p>
        <p>2. YOLO detections stream live to Dashboard WebSocket</p>
        <p>3. Dashboard shows annotated frames + detection gallery</p>
        <p>4. When real cameras are added, they replace the demo feed</p>
      </div>
    </div>
  );
}
