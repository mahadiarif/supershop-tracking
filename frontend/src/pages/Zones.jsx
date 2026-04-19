import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { 
    Grid2X2, 
    Plus, 
    Trash2, 
    Pencil, 
    X, 
    Layers, 
    Info, 
    CheckCircle2,
    Shield
} from 'lucide-react';

const emptyForm = { name: '', description: '', type: 'roi' };

export default function Zones() {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);

    const loadZones = async () => {
        setLoading(true);
        try {
            const res = await api.get('/zones');
            setZones(res.data || []);
        } catch (error) {
            console.error('Failed to load zones', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadZones();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/zones/${editingId}`, formData);
            } else {
                await api.post('/zones', formData);
            }
            setIsModalOpen(false);
            setEditingId(null);
            setFormData(emptyForm);
            loadZones();
        } catch (error) {
            console.error('Error saving zone', error);
            alert('Failed to save zone');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this processing zone? This might affect cameras assigned to it.')) return;
        try {
            await api.delete(`/zones/${id}`);
            loadZones();
        } catch (error) {
            console.error('Error deleting zone', error);
            alert('Failed to delete zone');
        }
    };

    const handleEdit = (zone) => {
        setEditingId(zone.id);
        setFormData({
            name: zone.name,
            description: zone.description || '',
            type: zone.type || 'roi'
        });
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-[#0b1624] p-5 rounded-2xl shadow-xl border border-cyan-500/20">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                        <Grid2X2 className="h-6 w-6 text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Processing Zones</h1>
                        <p className="text-[10px] font-bold text-cyan-400/60 uppercase tracking-widest">Spatial Intelligence Configurations</p>
                    </div>
                </div>
                
                <button 
                    onClick={() => {
                        setEditingId(null);
                        setFormData(emptyForm);
                        setIsModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/40 active:scale-95"
                >
                    <Plus className="h-4 w-4" />
                    Create New Zone
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Spatial Zones...</span>
                        </div>
                    </div>
                ) : zones.length > 0 ? (
                    zones.map((zone) => (
                        <div key={zone.id} className="group relative bg-[#0b1624] rounded-2xl border border-white/5 p-6 hover:border-cyan-500/30 transition-all duration-300 shadow-xl overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 flex gap-1 transform translate-x-10 group-hover:translate-x-0 transition-transform">
                                <button 
                                    onClick={() => handleEdit(zone)}
                                    className="p-2 bg-slate-800 hover:bg-cyan-600 text-slate-400 hover:text-white rounded-lg transition-colors border border-white/5"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button 
                                    onClick={() => handleDelete(zone.id)}
                                    className="p-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg transition-colors border border-white/5"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-[#08101a] rounded-xl border border-white/5 group-hover:border-cyan-500/20 group-hover:bg-cyan-500/5 transition-all">
                                    <Layers className="h-6 w-6 text-slate-400 group-hover:text-cyan-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors capitalize">{zone.name}</h3>
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[9px] font-black uppercase tracking-widest">
                                        {zone.type || 'ROI'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 p-3 bg-black/20 rounded-xl border border-white/5 min-h-[60px]">
                                <p className="text-xs text-slate-400 leading-relaxed italic">
                                    {zone.description || 'No specialized description provided for this surveillance region.'}
                                </p>
                            </div>

                            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-emerald-500/70">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.15em]">Zone Active</span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-600">
                                    ID: {String(zone.id).split('-')[0]}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center bg-[#0b1624] rounded-3xl border border-dashed border-slate-700">
                        <Layers className="mx-auto h-12 w-12 text-slate-700 mb-4 opacity-50" />
                        <h2 className="text-xl font-bold text-slate-400">No Spatial Zones Defined</h2>
                        <p className="text-sm text-slate-500 mt-2">Create zones to group cameras and analyze specific areas of your shop.</p>
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            className="mt-6 px-6 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-700 transition"
                        >
                            Get Started
                        </button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
                    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#0b1624] shadow-[0_0_50px_rgba(34,211,238,0.15)] animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-white/5 bg-[#09111b] px-6 py-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-cyan-500/10 rounded-lg">
                                    <Shield className="h-5 w-5 text-cyan-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white italic uppercase">{editingId ? 'Edit Configuration' : 'Initialize New Zone'}</h2>
                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Regional Surveillance Logic</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Zone Name</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="e.g. Counter Area"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Classification</label>
                                <select 
                                    value={formData.type}
                                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                                    className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                                >
                                    <option value="roi">Regular ROI</option>
                                    <option value="entrance">Entry/Exit Point</option>
                                    <option value="shelf">Shelf Monitoring</option>
                                    <option value="billing">Billing/Counter</option>
                                    <option value="security">High Security</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Functional Description</label>
                                <textarea 
                                    rows="3"
                                    placeholder="Describe the logic or purpose of this zone..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    className="w-full rounded-xl border border-white/5 bg-[#09111b] p-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 resize-none"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 rounded-xl border border-white/5 bg-slate-800/50 px-6 py-3.5 text-xs font-black uppercase tracking-[0.2em] text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                                >
                                    Discard
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-[2] rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3.5 text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-cyan-900/20 transition hover:brightness-110"
                                >
                                    {editingId ? 'Save Changes' : 'Initialize Zone'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
