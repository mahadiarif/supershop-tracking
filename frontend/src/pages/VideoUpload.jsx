import React, { useEffect, useRef, useState } from 'react';
import { getCameras, uploadVideo } from '../api/client';

const ALLOWED = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska', 'video/webm'];

export default function VideoUpload() {
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | uploading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    getCameras()
      .then((r) => {
        const list = r.data?.cameras ?? r.data ?? [];
        setCameras(list);
        if (list.length > 0) setCameraId(list[0].id);
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
    setResult(null);
    setStatus('idle');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !cameraId) return;

    const fd = new FormData();
    fd.append('camera_id', cameraId);
    fd.append('file', file);

    setStatus('uploading');
    setProgress(0);
    setError('');
    setResult(null);

    try {
      const res = await uploadVideo(fd, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setResult(res.data);
      setStatus('done');
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed.');
      setStatus('error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-black tracking-wide text-cyan-200">Video Upload Test</h1>
        <p className="mt-1 text-xs text-slate-400">
          Upload a video file to run YOLO inference and save detections to the database.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-cyan-500/15 bg-[#0b1929] p-5"
      >
        {/* Camera select */}
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">
            Camera
          </label>
          <select
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {cameras.length === 0 && <option value="">No cameras found</option>}
          </select>
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

        {/* Progress */}
        {status === 'uploading' && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Processing…</span>
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

        <button
          type="submit"
          disabled={!file || !cameraId || status === 'uploading'}
          className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'uploading' ? 'Processing…' : 'Upload & Analyze'}
        </button>
      </form>

      {/* Results */}
      {status === 'done' && result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-emerald-300">
            Analysis Complete
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: 'Total Frames', value: result.frames_total },
              { label: 'Frames Processed', value: result.frames_processed },
              { label: 'Frames Saved', value: result.frames_saved },
              { label: 'Total Detections', value: result.total_detections },
              { label: 'Total Persons', value: result.total_persons },
              { label: 'Resolution', value: result.resolution },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-100">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Detections saved to database. Check Dashboard for live feed updates.
          </p>
        </div>
      )}
    </div>
  );
}
