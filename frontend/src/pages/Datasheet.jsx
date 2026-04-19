import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { 
    Database, 
    Search, 
    Filter, 
    RefreshCcw, 
    Download, 
    ChevronLeft, 
    ChevronRight,
    Camera as CameraIcon,
    Clock,
    Tag,
    Maximize2
} from 'lucide-react';
import { format } from 'date-fns';

export default function Datasheet() {
    const [events, setEvents] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [limit] = useState(25);
    const [filters, setFilters] = useState({
        camera_id: '',
        event_type: '',
        start_date: '',
        end_date: ''
    });
    const [cameras, setCameras] = useState([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                skip: page * limit,
                limit,
                ...Object.fromEntries(
                    Object.entries(filters).filter(([_, v]) => v !== '')
                )
            };
            const res = await api.get('/events', { params });
            setEvents(res.data.events || []);
            setTotal(res.data.total || 0);
        } catch (error) {
            console.error('Failed to load events', error);
        } finally {
            setLoading(false);
        }
    }, [page, limit, filters]);

    const loadCameras = async () => {
        try {
            const res = await api.get('/cameras');
            setCameras(res.data || []);
        } catch (error) {
            console.error('Failed to load cameras', error);
        }
    };

    useEffect(() => {
        loadCameras();
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setPage(0);
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-[#0b1624] p-5 rounded-2xl shadow-xl border border-cyan-500/20 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                        <Database className="h-6 w-6 text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white italic uppercase">Event Data Sheet</h1>
                        <p className="text-xs font-semibold text-cyan-400/60 uppercase tracking-widest">Raw Surveillance Metadata Repository</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={() => loadData()}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-bold transition-all border border-slate-700"
                    >
                        <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-cyan-900/40">
                        <Download className="h-4 w-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#08101a] p-4 rounded-xl border border-white/5 shadow-inner">
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                        <CameraIcon className="h-3 w-3" /> Camera Source
                    </label>
                    <select 
                        name="camera_id"
                        value={filters.camera_id}
                        onChange={handleFilterChange}
                        className="w-full bg-[#0b1624] border border-cyan-500/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    >
                        <option value="">All Cameras</option>
                        {cameras.map(cam => (
                            <option key={cam.id} value={cam.id}>{cam.name}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Event Type
                    </label>
                    <select 
                        name="event_type"
                        value={filters.event_type}
                        onChange={handleFilterChange}
                        className="w-full bg-[#0b1624] border border-cyan-500/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    >
                        <option value="">All Types</option>
                        <option value="zone_entry">Zone Entry</option>
                        <option value="zone_exit">Zone Exit</option>
                        <option value="zone_dwell">Zone Dwell</option>
                        <option value="system">System Event</option>
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Start Date
                    </label>
                    <input 
                        type="date" 
                        name="start_date"
                        value={filters.start_date}
                        onChange={handleFilterChange}
                        className="w-full bg-[#0b1624] border border-cyan-500/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> End Date
                    </label>
                    <input 
                        type="date" 
                        name="end_date"
                        value={filters.end_date}
                        onChange={handleFilterChange}
                        className="w-full bg-[#0b1624] border border-cyan-500/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    />
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-[#0b1624] rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative">
                {loading && (
                    <div className="absolute inset-0 z-10 bg-[#0b1624]/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Hydrating Data Layer...</span>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="bg-[#09111b]/80 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="px-6 py-4">Timestamp</th>
                                <th className="px-6 py-4">Event #ID</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Target Class</th>
                                <th className="px-6 py-4">Conf %</th>
                                <th className="px-6 py-4">Track ID</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {events.length > 0 ? (
                                events.map((event) => (
                                    <tr key={event.id} className="group hover:bg-cyan-500/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-slate-200 font-medium">
                                                {format(new Date(event.created_at), 'MMM dd, HH:mm:ss')}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-mono">
                                                {format(new Date(event.created_at), 'yyyy')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-mono text-cyan-400/80 bg-cyan-900/20 px-2 py-0.5 rounded border border-cyan-800/30">
                                                {String(event.id).split('-')[0]}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                event.event_type === 'zone_entry' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                event.event_type === 'zone_exit' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                                'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            }`}>
                                                {event.event_type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.8)]"></div>
                                                <span className="text-slate-300 font-semibold capitalize">{event.object_class}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden inline-block mr-2 align-middle">
                                                <div 
                                                    className="bg-cyan-500 h-full rounded-full shadow-[0_0_5px_rgba(6,182,212,0.6)]" 
                                                    style={{ width: `${(event.confidence || 0) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-mono text-slate-400">
                                                {((event.confidence || 0) * 100).toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-slate-400 font-mono">#{event.track_id}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 text-slate-500 hover:text-cyan-400 transition-colors">
                                                <Maximize2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                !loading && (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Database className="h-10 w-10 text-slate-800" />
                                                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No records found in temporal range</p>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="bg-[#09111b]/95 px-6 py-4 border-t border-white/5 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Showing <span className="text-slate-300">{events.length}</span> of <span className="text-slate-300">{total}</span> signals
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button 
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        
                        <div className="flex items-center gap-1 px-3">
                            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-tighter">Page</span>
                            <span className="text-xs font-mono text-slate-100">{page + 1}</span>
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">/</span>
                            <span className="text-xs font-mono text-slate-500">{totalPages || 1}</span>
                        </div>

                        <button 
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
