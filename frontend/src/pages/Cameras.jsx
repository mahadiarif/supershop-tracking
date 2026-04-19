import React, { useEffect, useMemo, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import {
  Video,
  Plus,
  X,
  Trash2,
  ExternalLink,
  Search,
  RefreshCw,
  CheckCircle2,
  CircleOff,
  Pencil,
  Power,
} from 'lucide-react';
import api from '../api/client';

const emptyForm = { name: '', rtsp_url: '', mediamtx_path: '', status: 'online', zone_id: '' };

export default function Cameras() {
  const { cameras, error, refresh } = useCamera();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editingCameraId, setEditingCameraId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [zones, setZones] = useState([]);

  useEffect(() => {
    const loadZones = async () => {
      try {
        const res = await api.get('/zones');
        setZones(res.data || []);
      } catch (zoneError) {
        console.error('Failed to load zones', zoneError);
      }
    };

    loadZones();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingCameraId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (camera) => {
    setEditingCameraId(camera.id);
    setFormData({
      name: camera.name,
      rtsp_url: camera.rtsp_url,
      mediamtx_path: camera.mediamtx_path,
      status: camera.status || 'offline',
      zone_id: camera.zone_id || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmitCamera = async (e) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      rtsp_url: formData.rtsp_url,
      mediamtx_path: formData.mediamtx_path,
      zone_id: formData.zone_id || null,
      status: formData.status,
    };

    try {
      if (editingCameraId) {
        await api.put(`/cameras/${editingCameraId}`, payload);
      } else {
        await api.post('/cameras', payload);
      }
      setIsModalOpen(false);
      setEditingCameraId(null);
      setFormData(emptyForm);
      refresh();
    } catch (submitError) {
      console.error('Error saving camera', submitError);
      alert(`Failed to ${editingCameraId ? 'update' : 'add'} camera`);
    }
  };

  const handleDeleteCamera = async (id) => {
    if (!window.confirm('Delete this camera?')) return;
    try {
      await api.delete(`/cameras/${id}`);
      refresh();
    } catch (deleteError) {
      console.error('Error deleting camera', deleteError);
      alert('Failed to delete camera');
    }
  };

  const handleToggleWebEnabled = async (camera) => {
    try {
      await api.put(`/cameras/${camera.id}`, {
        web_enabled: camera.web_enabled === false,
      });
      refresh();
    } catch (statusError) {
      console.error('Failed to toggle camera web state', statusError);
      alert(`Failed to ${camera.web_enabled === false ? 'activate' : 'deactivate'} camera`);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const handleTestStream = (camera) => {
    if (!camera.mediamtx_path) {
      alert('MediaMTX path missing');
      return;
    }
    window.open(`http://localhost:8889/${camera.mediamtx_path}/`, '_blank', 'noopener,noreferrer');
  };

  const cameraList = cameras || [];
  const searchValue = searchTerm.trim().toLowerCase();
  const filteredCameras = useMemo(
    () =>
      cameraList.filter((cam) => {
        const matchesSearch =
          !searchValue ||
          cam.name.toLowerCase().includes(searchValue) ||
          cam.rtsp_url.toLowerCase().includes(searchValue) ||
          cam.mediamtx_path.toLowerCase().includes(searchValue);
        const matchesStatus = statusFilter === 'all' || cam.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [cameraList, searchValue, statusFilter]
  );

  const totalCameras = cameraList.length;
  const onlineCount = cameraList.filter((cam) => cam.status === 'online').length;
  const offlineCount = cameraList.filter((cam) => cam.status !== 'online').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-cyan-500/15 bg-[#0b1624] p-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Cameras</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-[#09111b]"
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-[#06111d] transition hover:brightness-110"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-slate-800 bg-[#0b1624] px-3 py-1">Total {totalCameras}</span>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">Online {onlineCount}</span>
        <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-rose-300">Offline {offlineCount}</span>
      </div>

      {error ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-cyan-500/15 bg-[#0b1624]">
        <div className="border-b border-cyan-500/15 bg-[#09111b] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cameras"
                className="w-full rounded-lg border border-slate-700 bg-[#0b1624] py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['all', 'online', 'offline'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    statusFilter === filter
                      ? 'bg-cyan-500 text-[#06111d]'
                      : 'border border-slate-700 bg-[#0b1624] text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!cameras ? (
          <div className="flex items-center justify-center gap-3 p-10 text-slate-500">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-cyan-500" />
            Loading cameras...
          </div>
        ) : filteredCameras.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Video className="mx-auto mb-4 h-14 w-14 text-slate-600" />
            <div className="text-sm">No cameras found</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#09111b] text-xs font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-4">Camera</th>
                  <th className="px-5 py-4">Path</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCameras.map((cam) => (
                  <tr key={cam.id} className="align-top transition-colors hover:bg-[#0f1d2f]">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-slate-800 p-2 text-slate-500 transition-colors group-hover:bg-cyan-500/10 group-hover:text-cyan-300">
                          <Video className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100">{cam.name}</div>
                          <div className="mt-1 max-w-[320px] break-all font-mono text-xs text-slate-500">{cam.rtsp_url}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs text-slate-400">/{cam.mediamtx_path}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          cam.status === 'online'
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                            : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {cam.status.toUpperCase()}
                      </span>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            cam.web_enabled === false
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                              : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
                          }`}
                        >
                          {cam.web_enabled === false ? 'WEB OFF' : 'WEB ON'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(cam)}
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-[#09111b] hover:text-cyan-300"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleTestStream(cam)}
                          disabled={!cam.mediamtx_path}
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-[#09111b] hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Test"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleWebEnabled(cam)}
                          className={`rounded-lg p-2 transition ${
                            cam.web_enabled === false
                              ? 'text-slate-500 hover:bg-[#09111b] hover:text-emerald-300'
                              : 'text-slate-500 hover:bg-[#09111b] hover:text-amber-300'
                          }`}
                          title={cam.web_enabled === false ? 'Activate on Web' : 'Deactivate from Web'}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCamera(cam.id)}
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-[#09111b] hover:text-rose-400"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#0b1624] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between border-b border-cyan-500/10 bg-[#09111b] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Video className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white italic uppercase tracking-tight">{editingCameraId ? 'Configure Node' : 'Register New Camera'}</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Surveillance Network Node</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCameraId(null);
                  setFormData(emptyForm);
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              {!editingCameraId && (
                <div className="mb-8">
                  <label className="mb-3 block text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500/60">Quick Presets</label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { id: 'usb', name: 'USB Cam', url: '0', path: 'usb_cam' },
                      { id: 'tiandy', name: 'Tiandy', url: 'rtsp://admin:admin123@192.168.1.100:554/live/main', path: 'tiandy_hq' },
                      { id: 'rtsp', name: 'Generic', url: 'rtsp://username:password@ip:port/stream', path: 'camera_main' },
                      { id: 'demo', name: 'Demo File', url: '/app/demo.mp4', path: 'demo_feed' },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, rtsp_url: preset.url, mediamtx_path: preset.path, name: preset.name })}
                        className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-[#09111b] p-3 text-xs font-bold text-slate-300 transition hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:text-cyan-200"
                      >
                        <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-cyan-900/40 transition-colors">
                          <Plus className="h-3 w-3" />
                        </div>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitCamera} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Camera Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Front Gate HQ"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Processing Zone</label>
                    <select
                      value={formData.zone_id}
                      onChange={(e) => setFormData({ ...formData, zone_id: e.target.value })}
                      className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
                    >
                      <option value="">Default Area</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">RTSP/Source URL</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="rtsp://... or 0 for USB"
                      value={formData.rtsp_url}
                      onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
                      required
                      className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 pl-4 text-sm font-mono text-cyan-200 outline-none transition focus:border-cyan-500/50"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">MediaMTX Resource Path</label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-mono text-xs">/</span>
                    <input
                      type="text"
                      placeholder="camera_main"
                      value={formData.mediamtx_path}
                      onChange={(e) => setFormData({ ...formData, mediamtx_path: e.target.value })}
                      required
                      className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 text-sm font-mono text-slate-200 outline-none transition focus:border-cyan-500/50"
                    />
                  </div>
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest pl-4">Virtual route for RTC/HLS streaming</p>
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingCameraId(null);
                      setFormData(emptyForm);
                    }}
                    className="flex-1 rounded-xl border border-white/5 bg-slate-800/50 px-6 py-3.5 text-sm font-bold text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                  >
                    Discard
                  </button>
                  <button type="submit" className="flex-[2] rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-cyan-900/20 transition hover:brightness-110 active:scale-[0.98]">
                    {editingCameraId ? 'Apply Config' : 'Initialize Node'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
