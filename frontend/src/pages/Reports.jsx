import React, { useEffect, useState } from 'react';
import api from '../api/client';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Download, Mail, CalendarDays, TrendingUp, ShieldAlert } from 'lucide-react';

const tabs = ['daily', 'weekly', 'monthly', 'incidents'];
const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed'];

export default function Reports() {
    const [tab, setTab] = useState('daily');
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
    const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [incidentRange, setIncidentRange] = useState({
        start: new Date().toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10)
    });

    const loadReport = async () => {
        setLoading(true);
        try {
            let res;
            if (tab === 'daily') {
                res = await api.get('/reports/daily', { params: { date: dailyDate } });
            } else if (tab === 'weekly') {
                res = await api.get('/reports/weekly', { params: { start: weekStart } });
            } else if (tab === 'monthly') {
                res = await api.get('/reports/monthly', { params: { month } });
            } else {
                res = await api.get('/reports/incidents', { params: incidentRange });
            }
            setReport(res.data);
        } catch (error) {
            console.error('Failed to load report', error);
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const downloadReport = async () => {
        const body =
            tab === 'daily'
                ? { type: 'daily', format: 'excel', date_range: { date: dailyDate } }
                : tab === 'weekly'
                ? { type: 'weekly', format: 'excel', date_range: { start: weekStart } }
                : tab === 'monthly'
                ? { type: 'monthly', format: 'excel', date_range: { month } }
                : { type: 'incidents', format: 'excel', date_range: incidentRange };

        const res = await api.post('/reports/export', body, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${tab}_report.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const sendEmail = async () => {
        const body =
            tab === 'daily'
                ? { type: 'daily', format: 'excel', date_range: { date: dailyDate } }
                : tab === 'weekly'
                ? { type: 'weekly', format: 'excel', date_range: { start: weekStart } }
                : tab === 'monthly'
                ? { type: 'monthly', format: 'excel', date_range: { month } }
                : { type: 'incidents', format: 'excel', date_range: incidentRange };
        await api.post('/reports/send-email', body);
        alert('Report email request sent.');
    };

    const dailySummary = report?.summary || {};

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-[#0b1624] p-4 rounded-xl shadow-sm border border-cyan-500/15">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Reports & Analytics</h1>
                    <p className="text-sm text-slate-500">Daily, weekly, monthly, and incident insights</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={downloadReport} className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                        <Download className="mr-2 h-4 w-4" /> Download
                    </button>
                    <button onClick={sendEmail} className="inline-flex items-center rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-[#09111b]">
                        <Mail className="mr-2 h-4 w-4" /> Email
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-700">
                {tabs.map((item) => (
                    <button
                        key={item}
                        onClick={() => setTab(item)}
                        className={`px-4 py-2 font-semibold capitalize ${tab === item ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}
                    >
                        {item}
                    </button>
                ))}
            </div>

            <div className="bg-[#0b1624] rounded-xl shadow-md border border-cyan-500/15 p-6 space-y-5">
                {loading ? (
                    <div className="text-center text-slate-500">Loading report...</div>
                ) : (
                    <>
                        {tab === 'daily' && (
                            <>
                                <div className="flex flex-wrap gap-3">
                                    <label className="text-sm text-slate-400">
                                        <span className="mb-1 block font-semibold">Date</span>
                                        <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="rounded-lg border border-slate-700 px-3 py-2" />
                                    </label>
                                    <button onClick={loadReport} className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-white">Load</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <MetricCard label="Customers" value={dailySummary.total_customers || 0} icon={<TrendingUp className="h-4 w-4" />} />
                                    <MetricCard label="Unique" value={dailySummary.unique_customers || 0} icon={<CalendarDays className="h-4 w-4" />} />
                                    <MetricCard label="Product Picks" value={dailySummary.product_picks || 0} icon={<ShieldAlert className="h-4 w-4" />} />
                                    <MetricCard label="Alerts" value={dailySummary.total_alerts || 0} icon={<ShieldAlert className="h-4 w-4" />} />
                                </div>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={report?.hourly_breakdown || []}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="hour" />
                                            <YAxis />
                                            <Tooltip />
                                            <Bar dataKey="count" fill="#2563eb" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        )}

                        {tab === 'weekly' && (
                            <>
                                <div className="flex flex-wrap gap-3">
                                    <label className="text-sm text-slate-400">
                                        <span className="mb-1 block font-semibold">Week start</span>
                                        <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-lg border border-slate-700 px-3 py-2" />
                                    </label>
                                    <button onClick={loadReport} className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-white">Load</button>
                                </div>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={report?.daily_breakdown || []}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="date" />
                                            <YAxis />
                                            <Tooltip />
                                            <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={3} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        )}

                        {tab === 'monthly' && (
                            <>
                                <div className="flex flex-wrap gap-3">
                                    <label className="text-sm text-slate-400">
                                        <span className="mb-1 block font-semibold">Month</span>
                                        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-700 px-3 py-2" />
                                    </label>
                                    <button onClick={loadReport} className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-white">Load</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={report?.daily_breakdown || []}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="date" />
                                                <YAxis />
                                                <Tooltip />
                                                <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={3} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={Object.entries(report?.alert_types || {}).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" outerRadius={110} label>
                                                    {(Object.entries(report?.alert_types || {}).length ? Object.entries(report.alert_types) : []).map((entry, index) => (
                                                        <Cell key={entry[0]} fill={colors[index % colors.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </>
                        )}

                        {tab === 'incidents' && (
                            <>
                                <div className="flex flex-wrap gap-3">
                                    <label className="text-sm text-slate-400">
                                        <span className="mb-1 block font-semibold">Start</span>
                                        <input type="date" value={incidentRange.start} onChange={(e) => setIncidentRange((prev) => ({ ...prev, start: e.target.value }))} className="rounded-lg border border-slate-700 px-3 py-2" />
                                    </label>
                                    <label className="text-sm text-slate-400">
                                        <span className="mb-1 block font-semibold">End</span>
                                        <input type="date" value={incidentRange.end} onChange={(e) => setIncidentRange((prev) => ({ ...prev, end: e.target.value }))} className="rounded-lg border border-slate-700 px-3 py-2" />
                                    </label>
                                    <button onClick={loadReport} className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-white">Load</button>
                                </div>
                                <div className="overflow-x-auto rounded-xl border border-slate-700">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="bg-[#09111b] text-slate-400 uppercase text-xs">
                                            <tr>
                                                <th className="px-4 py-3">Type</th>
                                                <th className="px-4 py-3">Severity</th>
                                                <th className="px-4 py-3">Created</th>
                                                <th className="px-4 py-3">Reviewed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {(report?.incidents || []).map((item) => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-3">{item.alert_type}</td>
                                                    <td className="px-4 py-3">{item.severity}</td>
                                                    <td className="px-4 py-3">{new Date(item.created_at).toLocaleString()}</td>
                                                    <td className="px-4 py-3">{item.is_reviewed ? 'Yes' : 'No'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function MetricCard({ label, value, icon }) {
    return (
        <div className="rounded-xl border border-cyan-500/15 bg-[#09111b] p-4">
            <div className="flex items-center justify-between text-sm text-slate-500">
                <span>{label}</span>
                {icon}
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-100">{value}</div>
        </div>
    );
}

