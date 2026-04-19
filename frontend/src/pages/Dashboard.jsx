import React, { useEffect, useMemo, useRef, useState } from 'react';
import api, { getDashboardStats } from '../api/client';
import LiveFeed from '../components/LiveFeed';
import { useWebSocket } from '../hooks/useWebSocket';
import { useCamera } from '../hooks/useCamera';
import { Activity, Users, Shield, LayoutGrid, VideoOff, X } from 'lucide-react';

function MetricCard({ value, label, icon: Icon, tone = 'cyan' }) {
  const toneClasses = {
    cyan: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10',
    green: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10',
    amber: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
    rose: 'text-rose-300 border-rose-500/20 bg-rose-500/10',
  };

  return (
    <div className="rounded-[1.1rem] border border-cyan-500/15 bg-[#0b1624] px-5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-3xl font-black tracking-[0.04em] text-slate-50">{value}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">{label}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-lg border ${toneClasses[tone] || toneClasses.cyan}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, right, icon: Icon, className = '', bodyClassName = '' }) {
  return (
    <section className={`rounded-[1.1rem] border border-cyan-500/15 bg-[#0b1624] shadow-[0_20px_50px_rgba(0,0,0,0.25)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="text-sm font-black uppercase tracking-[0.22em] text-slate-100">{title}</div>
        </div>
        {right ? <div className="flex flex-wrap items-center justify-end gap-2">{right}</div> : null}
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
  const [persistentGallery, setPersistentGallery] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

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
        setPersistentGallery((prev) => {
          let next = [...prev];
          detections.forEach((det) => {
            if (det.snapshot) {
              const now = new Date();
              const existingIndex = next.findIndex(item => item.track_id === det.track_id);
              
              // Spatial deduplication: Check if a similar object was added in the last 10 seconds
              const similarRecentIndex = next.findIndex(item => {
                if (item.track_id === det.track_id) return false;
                if (item.class_name !== det.class_name) return false;
                const timeDiff = (now - new Date(item.timestamp)) / 1000;
                if (timeDiff > 10) return false;

                // Center point calculation
                const c1 = { 
                  x: ((det.bbox[0] + det.bbox[2]) / 2), 
                  y: ((det.bbox[1] + det.bbox[3]) / 2) 
                };
                const c2 = { 
                  x: ((item.bbox[0] + item.bbox[2]) / 2), 
                  y: ((item.bbox[1] + item.bbox[3]) / 2) 
                };
                
                // Distance check (normalized to frame size - roughly 20% distance threshold)
                const dist = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
                return dist < 250; // Threshold for proximity
              });

              const newItem = {
                ...det,
                timestamp: now.toISOString(),
                camera_name: wsData.data.camera_key || 'Camera'
              };
              
              if (existingIndex !== -1) {
                // Update existing exact ID
                next[existingIndex] = newItem;
              } else if (similarRecentIndex !== -1) {
                // Assume it's the same person with a new ID
                next[similarRecentIndex] = { ...newItem, track_id: next[similarRecentIndex].track_id };
              } else {
                // Truly new detection
                next.unshift(newItem);
              }
            }
          });
          return next.slice(0, 24); // Keep last 24 unique tracks
        });

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
  const playerMinHeightClass = 'min-h-[300px] sm:min-h-[360px] lg:min-h-[440px] xl:min-h-[560px]';
  const snapshotStrip = selectedDetections.slice(0, 5);

  return (
    <div className="space-y-4 text-slate-100">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard value={stats.total_customers_today} label="Visits Today" icon={Users} tone="cyan" />
        <MetricCard value={stats.unique_persons_today} label="Unique Persons" icon={Users} tone="green" />
        <MetricCard value={stats.total_alerts} label="Active Alerts" icon={Shield} tone="amber" />
        <MetricCard value={uniqueTrackCount} label="Active Tracks" icon={LayoutGrid} tone="rose" />
      </div>

      <Panel
        title="Monitoring"
        icon={VideoOff}
        right={
          <>
            <span
              id="yolo-status-badge"
              className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${
                resolvedWorkerStatus === 'active'
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  : resolvedWorkerStatus === 'error'
                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
              }`}
            >
              {resolvedWorkerStatus === 'active' ? 'Active' : resolvedWorkerStatus === 'error' ? 'Error' : 'Idle'}
            </span>
            <select
              value={selectedCameraId}
              onChange={(event) => setSelectedCameraId(event.target.value)}
              className="min-w-[150px] rounded-md border border-cyan-500/20 bg-[#0a1320] px-3 py-1.5 text-xs text-slate-200 outline-none"
            >
              {enabledCameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name || camera.mediamtx_path || `Camera ${camera.id}`}
                </option>
              ))}
            </select>
          </>
        }
        className="overflow-hidden"
      >
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border-b border-cyan-500/10 xl:border-b-0 xl:border-r">
            <div className={`flex items-center justify-center bg-[#07111b] px-3 py-3 sm:px-4 sm:py-4 ${playerMinHeightClass}`}>
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

            <div className="border-t border-cyan-500/10 bg-[#0d1522]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/10 bg-[#0f1c2b] px-3 py-2.5 text-sm">
                <div className="font-semibold text-slate-100">
                  {selectedDetections.length > 0 ? `${selectedDetections.length} tracked object(s)` : 'Monitoring live camera feed'}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{selectedCameraPath}</span>
                  <span>{heartbeatLabel}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-6 lg:grid-cols-8">
                {persistentGallery.length === 0 ? (
                  <div className="col-span-full rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
                    No persistent snapshots yet. Waiting for detections...
                  </div>
                ) : (
                  persistentGallery.map((det, idx) => (
                    <div 
                      key={`${det.track_id}-${idx}`} 
                      onClick={() => setSelectedSnapshot(det)}
                      className="group cursor-pointer overflow-hidden rounded-lg border border-slate-800 bg-[#09111b] transition-all hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                    >
                      <div className="relative aspect-square bg-slate-950">
                        {det.snapshot ? (
                          <img
                            src={`data:image/jpeg;base64,${det.snapshot}`}
                            alt={det.class_name}
                            className="h-full w-full object-cover transition-transform group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-slate-700">NO IMG</div>
                        )}
                        <div className="absolute top-0 right-0 p-1">
                           <div className="px-1 bg-black/60 rounded text-[8px] font-mono text-cyan-400">#{det.track_id}</div>
                        </div>
                      </div>
                      <div className="border-t border-slate-800 px-2 py-1 text-[9px] font-bold text-slate-400 group-hover:text-cyan-300">
                        <div className="truncate">{String(det.class_name || 'object').toUpperCase()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col bg-[#0d1522]">
            <div className="border-b border-cyan-500/10 px-4 py-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Camera</div>
              <div className="mt-1 text-base font-semibold text-slate-100">{selectedCameraLabel}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Objects</div>
                  <div className="mt-1 text-2xl font-black text-cyan-300">{objectCountTotal}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Tracks</div>
                  <div className="mt-1 text-2xl font-black text-slate-100">{uniqueTrackCount}</div>
                </div>
              </div>
            </div>

            <div className="border-b border-cyan-500/10 px-4 py-4">
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Object Count</div>
              {Object.keys(classBreakdown).length === 0 ? (
                <div className="text-sm text-slate-500">Waiting for detections...</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(classBreakdown).map(([label, count]) => (
                    <div key={label}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
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
            </div>

            <div className="flex-1 px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Activity</div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Latest 8</span>
              </div>
              <div className="space-y-2">
                {activityFeed.length === 0 ? (
                  <div className="text-sm text-slate-500">Waiting for events...</div>
                ) : (
                  activityFeed.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-800 bg-[#09111b] px-3 py-2.5">
                      <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{new Date(item.created_at).toLocaleTimeString()}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Snapshot Full View Modal */}
      {selectedSnapshot && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div 
            className="relative w-full max-w-2xl bg-[#0b1624] rounded-3xl border border-cyan-500/30 overflow-hidden shadow-[0_0_100px_rgba(34,211,238,0.2)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-cyan-500/10 bg-[#09111b]">
              <div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Object Insight</h3>
                <p className="text-[10px] font-bold text-cyan-400/60 uppercase tracking-widest">Temporal Signature Artifact</p>
              </div>
              <button 
                onClick={() => setSelectedSnapshot(null)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center">
              <div className="relative w-full aspect-square max-w-md bg-black rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                <img 
                  src={`data:image/jpeg;base64,${selectedSnapshot.snapshot}`} 
                  alt="Full view" 
                  className="w-full h-full object-contain"
                />
              </div>
              
              <div className="w-full mt-8 grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                  <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Class Type</div>
                  <div className="text-lg font-bold text-cyan-300 capitalize">{selectedSnapshot.class_name}</div>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                  <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Track Identity</div>
                  <div className="text-lg font-bold text-white font-mono">#{selectedSnapshot.track_id}</div>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                  <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Confidence</div>
                  <div className="text-lg font-bold text-white">{((selectedSnapshot.confidence || 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                  <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Timestamp</div>
                  <div className="text-sm font-bold text-slate-400">{new Date(selectedSnapshot.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
