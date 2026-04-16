import React, { useEffect, useMemo, useRef, useState } from 'react';
import api, { getDashboardStats } from '../api/client';
import LiveFeed from '../components/LiveFeed';
import { useWebSocket } from '../hooks/useWebSocket';
import { useCamera } from '../hooks/useCamera';
import { Activity, Users, Shield, LayoutGrid, VideoOff } from 'lucide-react';

function MetricCard({ value, label, icon: Icon, tone = 'cyan' }) {
  const toneClasses = {
    cyan: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10',
    green: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10',
    amber: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
    rose: 'text-rose-300 border-rose-500/20 bg-rose-500/10',
  };

    return (
      <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1624] px-5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-black tracking-[0.08em] text-cyan-300">{value}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.45em] text-slate-500">{label}</div>
          </div>
        <div className={`grid h-11 w-11 place-items-center rounded-xl border ${toneClasses[tone] || toneClasses.cyan}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, right, icon: Icon, className = '', bodyClassName = '' }) {
  return (
    <section className={`rounded-2xl border border-cyan-500/15 bg-[#0b1624] shadow-[0_20px_50px_rgba(0,0,0,0.25)] ${className}`}>
      <div className="flex items-center justify-between border-b border-cyan-500/10 px-4 py-3">
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="text-sm font-black uppercase tracking-[0.35em] text-slate-100">{title}</div>
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_customers_today: 0,
    unique_persons_today: 0,
    currently_inside: 0,
    total_alerts: 0,
    active_cameras: 0,
    busiest_zone: 'N/A',
  });
  const [liveStats, setLiveStats] = useState({
    recent_events: 0,
    zone_counts: {},
    active_track_ids: [],
  });
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [liveDetectionsByCamera, setLiveDetectionsByCamera] = useState({});
  const [liveFrameSizesByCamera, setLiveFrameSizesByCamera] = useState({});
  const [liveFramesByCamera, setLiveFramesByCamera] = useState({});
  const [activityFeed, setActivityFeed] = useState([]);
  const [workerStatus, setWorkerStatus] = useState('idle');
  const [workerLastBeat, setWorkerLastBeat] = useState(null);
  const [clock, setClock] = useState(() => new Date());
  const liveDetectionsRef = useRef({});
  const activityKeysRef = useRef(new Set());

  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8001/ws/dashboard';
  const wsData = useWebSocket(wsUrl);
  const { cameras } = useCamera();
  const enabledCameras = useMemo(
    () => (cameras || []).filter((camera) => camera.web_enabled !== false),
    [cameras]
  );

  const selectedCamera = useMemo(() => {
    if (!enabledCameras || enabledCameras.length === 0) return null;
    return enabledCameras.find((cam) => cam.id === selectedCameraId) || enabledCameras[0];
  }, [enabledCameras, selectedCameraId]);

  const selectedDetections = selectedCamera ? liveDetectionsByCamera[selectedCamera.id] || [] : [];
  const selectedFrameSize = selectedCamera ? liveFrameSizesByCamera[selectedCamera.id] || null : null;
  const selectedFrameSrc = selectedCamera ? liveFramesByCamera[selectedCamera.id] || '' : '';
  const selectedCameraLabel = selectedCamera?.name || selectedCamera?.mediamtx_path || 'Camera Feed';
  const selectedCameraPath = selectedCamera?.mediamtx_path || '--';
  const objectCountTotal = selectedDetections.length;
  const classBreakdown = useMemo(() => {
    return selectedDetections.reduce((acc, item) => {
      const key = item.class_name || item.object_class || 'object';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [selectedDetections]);

  useEffect(() => {
    liveDetectionsRef.current = liveDetectionsByCamera;
  }, [liveDetectionsByCamera]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadStats();
    loadLiveStats();
    loadLiveDetections();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadLiveDetections();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadWorkerStatus = async () => {
      try {
        const res = await api.get('/worker/status');
        setWorkerStatus(res.data?.status || 'idle');
        setWorkerLastBeat(res.data?.last_heartbeat || null);
      } catch (error) {
        console.error(error);
        setWorkerStatus('error');
      }
    };

    loadWorkerStatus();
    const interval = setInterval(loadWorkerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedCameraId && enabledCameras && enabledCameras.length > 0) {
      const preferred = enabledCameras.find((camera) => String(camera.mediamtx_path || '').toLowerCase() === 'camera9');
      setSelectedCameraId(preferred?.id || enabledCameras[0].id);
    }
  }, [enabledCameras, selectedCameraId]);

  useEffect(() => {
    if (selectedCameraId) {
      api.post(`/system/active-tracking/${selectedCameraId}`).catch(console.error);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    if (!wsData) return;

    if (wsData.type === 'new_event') {
      const event = wsData.data || {};
      const typeLabel = (event.event_type || 'event').replaceAll('_', ' ');
      setActivityFeed((prev) => [
        {
          id: event.id || `${Date.now()}-${Math.random()}`,
          title: typeLabel.toUpperCase(),
          camera_id: event.camera_id,
          created_at: new Date().toISOString(),
          severity: 'info',
        },
        ...prev,
      ].slice(0, 8));
      loadStats();
      loadLiveStats();
    }

    if (wsData.type === 'new_alert') {
      const alert = wsData.data || {};
      setActivityFeed((prev) => [
        {
          id: alert.id || `${Date.now()}-${Math.random()}`,
          title: (alert.alert_type || 'alert').replaceAll('_', ' ').toUpperCase(),
          camera_id: alert.camera_id,
          created_at: new Date().toISOString(),
          severity: alert.severity || 'high',
        },
        ...prev,
      ].slice(0, 8));
      loadStats();
    }

    if ((wsData.type === 'detection' || wsData.type === 'live_detections') && wsData.data?.camera_id) {
      const cameraId = String(wsData.data.camera_id);
      const detections = (wsData.data.detections || []).map((item) => ({
        ...item,
        class_name: item.class_name || item.object_class || 'object',
      }));

      setLiveDetectionsByCamera((prev) => ({
        ...prev,
        [cameraId]: detections,
      }));
      setLiveFrameSizesByCamera((prev) => ({
        ...prev,
        [cameraId]: {
          width: wsData.data.frame_width || 1280,
          height: wsData.data.frame_height || 720,
        },
      }));
      if (wsData.data.frame) {
        setLiveFramesByCamera((prev) => ({
          ...prev,
          [cameraId]: wsData.data.frame.startsWith('data:image')
            ? wsData.data.frame
            : `data:image/jpeg;base64,${wsData.data.frame}`,
        }));
      }
      if (wsData.data.worker_status) {
        setWorkerStatus(wsData.data.worker_status);
      }

      if (detections.length > 0) {
        const topDetection = detections[0];
        const activityKey = `${cameraId}-${topDetection.track_id}-${Math.floor(Date.now() / 4000)}`;
        if (!activityKeysRef.current.has(activityKey)) {
          activityKeysRef.current.add(activityKey);
          setActivityFeed((prev) => [
            {
              id: activityKey,
              title: `${topDetection.class_name || 'object'} detected`.toUpperCase(),
              camera_id: cameraId,
              created_at: new Date().toISOString(),
              severity: 'info',
            },
            ...prev,
          ].slice(0, 8));
        }
      }

      setSelectedCameraId((prev) => {
        if (!prev) return cameraId;
        const currentTracks = liveDetectionsRef.current[prev] || [];
        if (currentTracks.length === 0 && detections.length > 0) {
          return cameraId;
        }
        return prev;
      });
    }

    if (wsData.type === 'worker_status') {
      setWorkerStatus(wsData.status || 'idle');
      setWorkerLastBeat(wsData.last_heartbeat || new Date().toISOString());
    }
  }, [wsData]);

  const loadStats = async () => {
    try {
      const res = await getDashboardStats();
      setStats(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadLiveStats = async () => {
    try {
      const res = await api.get('/dashboard/live');
      setLiveStats(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadLiveDetections = async () => {
    try {
      const res = await api.get('/dashboard/live-detections');
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      if (items.length === 0) return;

      setLiveDetectionsByCamera((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          if (!item?.camera_id) return;
          const detections = (item.detections || []).map((entry) => ({
            ...entry,
            class_name: entry.class_name || entry.object_class || 'object',
          }));
          next[String(item.camera_id)] = detections;
        });
        return next;
      });

      setLiveFrameSizesByCamera((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          if (!item?.camera_id) return;
          next[String(item.camera_id)] = {
            width: item.frame_width || 1280,
            height: item.frame_height || 720,
          };
        });
        return next;
      });

      setActivityFeed((prev) => {
        const next = [...prev];
        items.forEach((item) => {
          if (!item?.camera_id || !Array.isArray(item.detections) || item.detections.length === 0) return;
          const topDetection = item.detections[0];
          const activityKey = `${item.camera_id}-${topDetection.track_id}-${String(item.timestamp || '').slice(0, 16)}`;
          if (activityKeysRef.current.has(activityKey)) return;
          activityKeysRef.current.add(activityKey);
          next.unshift({
            id: activityKey,
            title: `${topDetection.class_name || 'object'} detected`.toUpperCase(),
            camera_id: item.camera_id,
            created_at: item.timestamp || new Date().toISOString(),
            severity: 'info',
          });
        });
        return next.slice(0, 8);
      });
    } catch (error) {
      console.error(error);
    }
  };

  const feedUrl = selectedCamera ? `http://localhost:8889/${selectedCamera.mediamtx_path}/` : '';
  const uniqueTrackCount = new Set(selectedDetections.map((item) => item.track_id).filter((value) => value !== undefined && value !== null)).size;
  const heartbeatLabel = useMemo(() => {
    if (!workerLastBeat) return 'No heartbeat';
    const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(workerLastBeat).getTime()) / 1000));
    if (Number.isNaN(diffSeconds)) return 'Heartbeat unknown';
    if (diffSeconds > 15) return 'Heartbeat stale';
    if (diffSeconds < 60) return `Heartbeat: ${diffSeconds}s ago`;
    const minutes = Math.floor(diffSeconds / 60);
    const remaining = diffSeconds % 60;
    return `Heartbeat: ${minutes}m ${remaining}s ago`;
  }, [workerLastBeat]);
  const heartbeatTone = useMemo(() => {
    if (!workerLastBeat) return 'amber';
    const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(workerLastBeat).getTime()) / 1000));
    if (Number.isNaN(diffSeconds)) return 'rose';
    if (diffSeconds <= 5) return 'emerald';
    if (diffSeconds <= 15) return 'amber';
    return 'rose';
  }, [workerLastBeat]);
  const resolvedWorkerStatus = useMemo(() => {
    if (!workerLastBeat) {
      return workerStatus === 'error' ? 'error' : 'idle';
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(workerLastBeat).getTime()) / 1000));
    if (Number.isNaN(diffSeconds) || diffSeconds > 15) {
      return 'idle';
    }

    if (workerStatus === 'error') return 'error';
    if (workerStatus === 'active') return 'active';
    return 'idle';
  }, [workerLastBeat, workerStatus]);
  const zoneEntries = Object.entries(liveStats.zone_counts || {});
  const topDetectedLabel = selectedDetections[0]?.class_name ? String(selectedDetections[0].class_name).toUpperCase() : 'NO TRACKS';

  return (
    <div className="space-y-4 text-slate-100">
      <div className="rounded-[1.6rem] border border-cyan-500/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_35%),#0b1624] px-5 py-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="text-[11px] font-black uppercase tracking-[0.55em] text-cyan-400">Live Camera</div>
            <div className="text-3xl font-black tracking-[0.08em] text-slate-50">Smart Surveillance View</div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span className="rounded-full border border-cyan-500/15 bg-[#09111b] px-3 py-1.5 text-slate-300">
                {selectedCameraLabel}
              </span>
              <span className="rounded-full border border-slate-700 bg-[#09111b] px-3 py-1.5">
                Path: {selectedCameraPath}
              </span>
              <span className="rounded-full border border-slate-700 bg-[#09111b] px-3 py-1.5">
                Lead Track: {topDetectedLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-cyan-500/15 bg-[#09111b] px-3 py-2 text-xs font-semibold text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              LIVE
              <span className="mx-1 text-slate-600">|</span>
              {clock.toLocaleTimeString()}
            </div>
            <div className="rounded-full border border-slate-700 bg-[#09111b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
              {resolvedWorkerStatus === 'active' ? 'Tracking Active' : resolvedWorkerStatus === 'error' ? 'Tracking Error' : 'Tracking Idle'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <MetricCard value={stats.total_customers_today} label="Visits Today" icon={Users} tone="cyan" />
        <MetricCard value={stats.unique_persons_today} label="Unique Persons" icon={Users} tone="green" />
        <MetricCard value={stats.total_alerts} label="Active Alerts" icon={Shield} tone="amber" />
        <MetricCard value={uniqueTrackCount} label="Active Tracks" icon={LayoutGrid} tone="rose" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(360px,1fr)]">
        <div className="space-y-4">
          <Panel
            title="Live Feed Terminal"
            icon={VideoOff}
            right={
              <div className="flex items-center gap-2">
                <span
                  id="yolo-status-badge"
                  className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.35em] ${
                    resolvedWorkerStatus === 'active'
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                      : resolvedWorkerStatus === 'error'
                        ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                        : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {resolvedWorkerStatus === 'active' ? 'YOLO ACTIVE' : resolvedWorkerStatus === 'error' ? 'YOLO ERROR' : 'YOLO IDLE'}
                </span>
                <span
                  className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.25em] ${
                    heartbeatTone === 'emerald'
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                      : heartbeatTone === 'amber'
                        ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                        : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {heartbeatLabel}
                </span>
                  <select
                  value={selectedCameraId}
                  onChange={(event) => setSelectedCameraId(event.target.value)}
                  className="rounded-md border border-cyan-500/20 bg-[#0a1320] px-3 py-1.5 text-xs text-slate-200 outline-none"
                >
                  {enabledCameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.name || camera.mediamtx_path || `Camera ${camera.id}`}
                    </option>
                  ))}
                </select>
              </div>
            }
            className="overflow-hidden"
          >
            <div className="rounded-[1.35rem] border border-cyan-500/10 bg-[#07111b]">
              <div className="grid gap-4 border-b border-cyan-500/10 px-4 py-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-[#09111b] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Selected Camera</div>
                  <div className="mt-2 text-lg font-bold text-slate-100">{selectedCameraLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedCameraPath}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#09111b] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Stream State</div>
                  <div className={`mt-2 text-lg font-bold ${selectedCamera?.status === 'online' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selectedCamera?.status === 'online' ? 'Stable Live Feed' : 'Offline Source'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{heartbeatLabel}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#09111b] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Tracking Summary</div>
                  <div className="mt-2 text-lg font-bold text-cyan-300">{objectCountTotal} object(s)</div>
                  <div className="mt-1 text-xs text-slate-500">{uniqueTrackCount} active track ID(s)</div>
                </div>
              </div>

              <div className="flex min-h-[560px] items-center justify-center px-4 py-4">
                {selectedCamera ? (
                  <div className="w-full">
                    <LiveFeed
                      cameraId={selectedCamera.id}
                      zoneName={selectedCamera.name || selectedCamera.mediamtx_path || 'Main Gate'}
                      url={feedUrl}
                      status={selectedCamera.status}
                      detections={selectedDetections}
                      frameSize={selectedFrameSize}
                      frameSrc={selectedFrameSrc}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-24 text-center text-slate-500">
                    <VideoOff className="h-14 w-14 opacity-40" />
                    <div className="text-sm font-semibold uppercase tracking-[0.35em]">No Signal</div>
                    <div className="text-xs text-slate-600">Waiting for camera stream...</div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 border-t border-cyan-500/10 px-4 py-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-[#09111b] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Worker</div>
                  <div className="mt-2 text-sm font-semibold text-slate-100">
                    {resolvedWorkerStatus === 'active' ? 'Receiving live detections' : 'Waiting for detection heartbeat'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#09111b] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Current Focus</div>
                  <div className="mt-2 text-sm font-semibold text-slate-100">{topDetectedLabel}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#09111b] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Feed Health</div>
                  <div className="mt-2 text-sm font-semibold text-slate-100">Live polling stable</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 xl:h-[760px]">
          <Panel
            title="Object Count"
            icon={LayoutGrid}
            right={<button className="text-xs text-cyan-300">Refresh</button>}
            className="flex h-[372px] flex-col"
            bodyClassName="flex flex-1 flex-col overflow-hidden"
          >
            {Object.keys(classBreakdown).length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Waiting for detections...</div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1">
                {Object.entries(classBreakdown).map(([label, count]) => (
                  <div key={label} className="rounded-2xl border border-slate-800 bg-[#09111b] px-3 py-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-200">{label}</span>
                      <span className="text-slate-500">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                        style={{ width: `${Math.max(10, Math.min(100, count * 24))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Activity Stream"
            icon={Activity}
            right={<span className="text-xs text-slate-500">Latest 8</span>}
            className="flex h-[372px] flex-col"
            bodyClassName="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex flex-1 flex-col space-y-2 overflow-y-auto pr-1">
              {activityFeed.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Waiting for events...</div>
              ) : (
                activityFeed.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#09111b] px-3 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                      <div className="text-xs text-slate-500">
                        {item.camera_id ? `Camera ${String(item.camera_id).slice(0, 8)}` : 'Camera --'}
                      </div>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
                      {new Date(item.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Panel title="Live Activity Snapshots" icon={Activity}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {selectedDetections.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                No active snapshots yet.
              </div>
            ) : (
              selectedDetections.map((det) => (
                <div key={`${det.track_id}-${det.class_name}`} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-[#09111b] transition-all hover:border-cyan-500/30">
                  <div className="aspect-square w-full bg-slate-900">
                    {det.snapshot ? (
                      <img 
                        src={`data:image/jpeg;base64,${det.snapshot}`} 
                        alt={det.class_name} 
                        className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-slate-700">NO IMG</div>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="truncate text-[10px] font-bold uppercase text-slate-100">{det.class_name}</div>
                    <div className="text-[10px] text-cyan-400">ID: {det.track_id}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
