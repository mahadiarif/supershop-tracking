import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { AlertTriangle, RefreshCw, CheckCircle2, Filter, Image, ClipboardList } from 'lucide-react';

const pageSize = 10;

export default function Alerts() {
    const [alerts, setAlerts] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        severity: 'all',
        reviewed: 'all',
        startDate: '',
        endDate: ''
    });
    const [selectedIds, setSelectedIds] = useState([]);
    const [activeAlert, setActiveAlert] = useState(null);
    const [reviewer, setReviewer] = useState('admin');
    const [page, setPage] = useState(0);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const params = {
                skip: page * pageSize,
                limit: pageSize
            };
            if (filters.severity !== 'all') params.severity = filters.severity;
            if (filters.reviewed !== 'all') params.is_reviewed = filters.reviewed === 'reviewed';
            if (filters.startDate) params.start_date = filters.startDate;
            if (filters.endDate) params.end_date = filters.endDate;

            const res = await api.get('/alerts', { params });
            setAlerts(res.data.alerts || []);
            setTotal(res.data.total || 0);
            setSelectedIds([]);
            setActiveAlert((prev) => {
                if (!prev) return res.data.alerts?.[0] || null;
                return res.data.alerts?.find((item) => item.id === prev.id) || res.data.alerts?.[0] || null;
            });
        } catch (error) {
            console.error('Failed to load alerts', error);
            setAlerts([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, filters.severity, filters.reviewed, filters.startDate, filters.endDate]);

    const stats = useMemo(() => {
        const reviewed = alerts.filter((item) => item.is_reviewed).length;
        const unreviewed = alerts.length - reviewed;
        return { reviewed, unreviewed };
    }, [alerts]);

    const toggleSelect = (id) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const reviewAlert = async (alertId) => {
        try {
            await api.put(`/alerts/${alertId}/review`, { reviewed_by: reviewer });
            await fetchAlerts();
        } catch (error) {
            console.error('Review failed', error);
            alert('Failed to review alert');
        }
    };

    const bulkReview = async () => {
        if (selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map((id) => api.put(`/alerts/${id}/review`, { reviewed_by: reviewer })));
            await fetchAlerts();
        } catch (error) {
            console.error('Bulk review failed', error);
            alert('Failed to review selected alerts');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-[#0b1624] p-4 rounded-xl shadow-sm border border-cyan-500/15">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Alert History</h1>
                    <p className="text-sm text-slate-500">Filter, review, and inspect suspicious activity</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={fetchAlerts} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-[#09111b] flex items-center">
                        <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                    </button>
                    <button onClick={bulkReview} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center">
                        <ClipboardList className="mr-2 h-4 w-4" /> Bulk Review
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#0b1624] p-4 rounded-xl border border-cyan-500/15 shadow-sm">
                    <div className="text-sm text-slate-500">Shown Alerts</div>
                    <div className="text-2xl font-bold text-slate-100">{alerts.length}</div>
                </div>
                <div className="bg-[#0b1624] p-4 rounded-xl border border-cyan-500/15 shadow-sm">
                    <div className="text-sm text-slate-500">Unreviewed</div>
                    <div className="text-2xl font-bold text-amber-600">{stats.unreviewed}</div>
                </div>
                <div className="bg-[#0b1624] p-4 rounded-xl border border-cyan-500/15 shadow-sm">
                    <div className="text-sm text-slate-500">Reviewer</div>
                    <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm" />
                </div>
            </div>

            <div className="bg-[#0b1624] rounded-xl shadow-md border border-cyan-500/15 overflow-hidden">
                <div className="border-b border-cyan-500/15 bg-[#09111b] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <select value={filters.severity} onChange={(e) => setFilters((prev) => ({ ...prev, severity: e.target.value }))} className="rounded-lg border border-slate-700 bg-[#0b1624] px-3 py-2 text-sm">
                                <option value="all">All Severities</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                            </select>
                            <select value={filters.reviewed} onChange={(e) => setFilters((prev) => ({ ...prev, reviewed: e.target.value }))} className="rounded-lg border border-slate-700 bg-[#0b1624] px-3 py-2 text-sm">
                                <option value="all">All Status</option>
                                <option value="reviewed">Reviewed</option>
                                <option value="unreviewed">Unreviewed</option>
                            </select>
                            <input type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} className="rounded-lg border border-slate-700 bg-[#0b1624] px-3 py-2 text-sm" />
                            <input type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} className="rounded-lg border border-slate-700 bg-[#0b1624] px-3 py-2 text-sm" />
                        </div>
                        <div className="text-sm text-slate-500 flex items-center">
                            <Filter className="mr-2 h-4 w-4" />
                            Total matching alerts: <span className="ml-1 font-semibold text-slate-100">{total}</span>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-slate-500">Loading alerts...</div>
                ) : alerts.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                        No alerts found for the selected filters.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3">
                        <div className="xl:col-span-2 divide-y divide-slate-800">
                            {alerts.map((alert) => (
                                <div key={alert.id} className={`p-4 hover:bg-[#0f1d2f] transition ${activeAlert?.id === alert.id ? 'bg-[#0f1d2f]' : ''}`}>
                                    <div className="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(alert.id)}
                                            onChange={() => toggleSelect(alert.id)}
                                            className="mt-1 h-4 w-4 rounded border-slate-600"
                                        />
                                        <button onClick={() => setActiveAlert(alert)} className="flex-1 text-left">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-300">
                                                    {String(alert.alert_type).replace('_', ' ').toUpperCase()}
                                                </span>
                                                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-400">
                                                    {String(alert.severity).toUpperCase()}
                                                </span>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alert.is_reviewed ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                                                    {alert.is_reviewed ? 'Reviewed' : 'Unreviewed'}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-sm text-slate-100 font-semibold">
                                                Camera: {alert.camera_id}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {new Date(alert.created_at).toLocaleString()}
                                            </div>
                                        </button>
                                        {!alert.is_reviewed && (
                                            <button
                                                onClick={() => reviewAlert(alert.id)}
                                                className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                                            >
                                                Mark reviewed
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t xl:border-t-0 xl:border-l border-cyan-500/15 bg-[#09111b] p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="font-bold text-slate-100">Alert Details</h2>
                                <Image className="h-4 w-4 text-slate-500" />
                            </div>

                            {activeAlert ? (
                                <div className="space-y-3 text-sm">
                                    <div className="rounded-lg bg-[#0b1624] p-3 border border-cyan-500/15">
                                        <div className="text-xs text-slate-500">Type</div>
                                        <div className="font-semibold text-slate-100">{String(activeAlert.alert_type).replace('_', ' ')}</div>
                                    </div>
                                    <div className="rounded-lg bg-[#0b1624] p-3 border border-cyan-500/15">
                                        <div className="text-xs text-slate-500">Severity</div>
                                        <div className="font-semibold text-slate-100">{String(activeAlert.severity)}</div>
                                    </div>
                                    <div className="rounded-lg bg-[#0b1624] p-3 border border-cyan-500/15">
                                        <div className="text-xs text-slate-500">Reviewed</div>
                                        <div className="font-semibold text-slate-100">{activeAlert.is_reviewed ? 'Yes' : 'No'}</div>
                                    </div>
                                    {activeAlert.snapshot_before && (
                                        <a href={`/snapshots/${String(activeAlert.snapshot_before).replace(/^\/+/, '')}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-[#0b1624] p-3 border border-cyan-500/15 text-cyan-300 hover:underline">
                                            View before snapshot
                                        </a>
                                    )}
                                    {activeAlert.snapshot_during && (
                                        <a href={`/snapshots/${String(activeAlert.snapshot_during).replace(/^\/+/, '')}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-[#0b1624] p-3 border border-cyan-500/15 text-cyan-300 hover:underline">
                                            View during snapshot
                                        </a>
                                    )}
                                    {activeAlert.snapshot_after && (
                                        <a href={`/snapshots/${String(activeAlert.snapshot_after).replace(/^\/+/, '')}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-[#0b1624] p-3 border border-cyan-500/15 text-cyan-300 hover:underline">
                                            View after snapshot
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-slate-600 bg-[#0b1624] p-6 text-center text-slate-500">
                                    Select an alert to inspect details.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
                <button onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0} className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-50">
                    Previous
                </button>
                <span>
                    Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button onClick={() => setPage((prev) => prev + 1)} disabled={(page + 1) * pageSize >= total} className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-50">
                    Next
                </button>
            </div>
        </div>
    );
}

