import React, { useEffect, useState } from 'react';
import api from '../api/client';
import {
    Server,
    Database,
    Video,
    Activity,
    CheckCircle,
    XCircle,
    Cpu,
    Power
} from 'lucide-react';

export default function SystemStatus() {
    const [healthData, setHealthData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [togglingKey, setTogglingKey] = useState(null);

    const checkHealth = async () => {
        setLoading(true);
        try {
            const res = await api.get('/system/health');
            setHealthData(res.data);
        } catch (error) {
            setHealthData({
                status: 'error',
                services: [
                    {
                        key: 'backend_api',
                        service: 'Backend API',
                        status: 'offline',
                        detail: 'Core processing application.',
                        message: 'Failed to connect to backend server.',
                        controllable: false,
                        running: false
                    }
                ]
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkHealth();
    }, []);

    const toggleService = async (svc) => {
        if (!svc.controllable || togglingKey) return;

        setTogglingKey(svc.key);
        try {
            const action = svc.running ? 'stop' : 'start';
            await api.post(`/system/services/${svc.key}/${action}`);
            await checkHealth();
        } catch (error) {
            const message = error?.response?.data?.detail || `Failed to ${svc.running ? 'stop' : 'start'} ${svc.service}.`;
            setHealthData((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    services: prev.services.map((item) =>
                        item.key === svc.key ? { ...item, message } : item
                    )
                };
            });
        } finally {
            setTogglingKey(null);
        }
    };

    const getIcon = (serviceKey, serviceName) => {
        if (serviceKey === 'database' || serviceName.includes('Database')) {
            return <Database className="w-8 h-8 text-cyan-400" />;
        }
        if (serviceKey === 'redis' || serviceName.includes('Redis')) {
            return <Database className="w-8 h-8 text-emerald-400" />;
        }
        if (serviceKey === 'mediamtx' || serviceName.includes('MediaMTX')) {
            return <Video className="w-8 h-8 text-fuchsia-400" />;
        }
        if (serviceKey === 'python_worker' || serviceName.includes('Worker')) {
            return <Cpu className="w-8 h-8 text-amber-400" />;
        }
        if (serviceKey === 'backend_api' || serviceName.includes('Backend')) {
            return <Server className="w-8 h-8 text-indigo-400" />;
        }
        return <Activity className="w-8 h-8 text-slate-500" />;
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center bg-[#0b1624] p-4 rounded-xl shadow-sm border border-cyan-500/15">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">System Status</h1>
                    <p className="text-sm text-slate-500">Monitor the local tracking stack: database, cache, stream server, worker, and backend.</p>
                </div>
                <button
                    onClick={checkHealth}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
                    disabled={loading || !!togglingKey}
                >
                    {loading ? 'Checking...' : 'Refresh Status'}
                </button>
            </div>

            <div className="bg-[#0b1624] rounded-xl shadow-md border border-cyan-500/15 p-6">
                {!healthData ? (
                    <div className="p-10 text-center text-slate-500 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                        Connecting to components...
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className={`p-4 rounded-lg flex items-center border font-semibold ${healthData.status === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
                            {healthData.status === 'ok' ? (
                                <><CheckCircle className="w-6 h-6 mr-2" /> All Required Systems Operational</>
                            ) : (
                                <><XCircle className="w-6 h-6 mr-2" /> System Attention Required</>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <div className="rounded-xl border border-slate-700 bg-[#09111b] p-4">
                                <div className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Tracking Stack</div>
                                <div className="mt-2 text-2xl font-black text-cyan-300">
                                    {healthData.services.filter((svc) => svc.status === 'online').length}/{healthData.services.length}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-[#09111b] p-4">
                                <div className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Redis</div>
                                <div className={`mt-2 text-2xl font-black ${healthData.services.find((svc) => svc.key === 'redis')?.status === 'online' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {healthData.services.find((svc) => svc.key === 'redis')?.status === 'online' ? 'OK' : 'OFF'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-[#09111b] p-4">
                                <div className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Worker</div>
                                <div className={`mt-2 text-2xl font-black ${healthData.services.find((svc) => svc.key === 'python_worker')?.status === 'online' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {healthData.services.find((svc) => svc.key === 'python_worker')?.status === 'online' ? 'ON' : 'OFF'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-[#09111b] p-4">
                                <div className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Streams</div>
                                <div className={`mt-2 text-2xl font-black ${healthData.services.find((svc) => svc.key === 'mediamtx')?.status === 'online' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {healthData.services.find((svc) => svc.key === 'mediamtx')?.status === 'online' ? 'LIVE' : 'OFF'}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {healthData.services.map((svc, idx) => {
                                const isBusy = togglingKey === svc.key;
                                const isOnline = svc.status === 'online';

                                return (
                                    <div key={svc.key || idx} className="bg-[#0b1624] border border-cyan-500/15 hover:border-cyan-400/30 transition-colors rounded-xl p-5 shadow-sm relative overflow-hidden group">
                                        <div className="flex items-start justify-between mb-4 gap-4">
                                            <div className="p-3 bg-[#09111b] rounded-lg group-hover:bg-cyan-500/10 transition-colors">
                                                {getIcon(svc.key, svc.service)}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`px-2.5 py-1 text-xs font-bold rounded-full border ${isOnline ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border-rose-500/20'}`}>
                                                    {svc.status.toUpperCase()}
                                                </div>
                                                {svc.controllable && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleService(svc)}
                                                            disabled={isBusy || loading}
                                                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${svc.running ? 'bg-emerald-500' : 'bg-slate-700'} ${isBusy ? 'opacity-70 cursor-wait' : ''}`}
                                                            aria-label={`${svc.running ? 'Stop' : 'Start'} ${svc.service}`}
                                                        >
                                                            <span className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-[#0b1624] text-slate-300 shadow transition ${svc.running ? 'translate-x-8' : 'translate-x-1'}`}>
                                                                <Power className="w-3 h-3" />
                                                            </span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-100 mb-1">{svc.service}</h3>
                                        <p className="text-sm text-slate-500 mb-4 min-h-10">{svc.detail}</p>

                                        <div className="pt-3 border-t border-cyan-500/15 space-y-2">
                                            <p className={`text-xs ${isOnline ? 'text-emerald-300' : 'text-rose-300'} font-medium break-words`}>
                                                {isBusy ? `${svc.running ? 'Stopping' : 'Starting'} service...` : svc.message}
                                            </p>
                                            {svc.controllable && (
                                                <p className="text-xs text-slate-500">
                                                    Switch {svc.running ? 'off' : 'on'} from this panel.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {healthData.status !== 'ok' && (
                                    <div className="mt-8 bg-[#09111b] p-6 rounded-xl border border-slate-700">
                                        <h4 className="font-bold text-slate-100 mb-2 flex items-center">
                                    <Activity className="w-5 h-5 mr-2 text-cyan-400" /> Troubleshooting Guide
                                </h4>
                                <ul className="list-disc pl-5 text-sm text-slate-400 space-y-2">
                                    <li>If <strong>Backend API</strong> is offline, start the FastAPI server first.</li>
                                    <li>If <strong>Database</strong> is offline, ensure the configured database is reachable.</li>
                                    <li>If <strong>Stream Server (MediaMTX)</strong> or <strong>Python Worker</strong> is offline, use the switch above to start it locally.</li>
                                </ul>
                            </div>
                        )}

                        <div className="rounded-xl border border-cyan-500/15 bg-[#09111b] p-4 text-sm text-slate-400">
                            Local memory cache mode is enabled, so the app can run fully on this PC without Docker. Redis can still be added later if you want extra cache performance.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
