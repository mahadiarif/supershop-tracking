import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function AlertPanel({ wsData }) {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        if (wsData && wsData.type === 'new_alert') {
            setAlerts(prev => [wsData.data, ...prev].slice(0, 10)); // Keep last 10
        }
    }, [wsData]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black flex items-center uppercase tracking-[0.35em] text-slate-100">
                    <AlertTriangle className="mr-2 text-rose-400 h-5 w-5" /> Live Alerts
                </h2>
                <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-300">{alerts.length}</span>
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto">
                {alerts.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center mt-10">No recent alerts.</p>
                ) : (
                    alerts.map((alert, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-800 bg-[#09111b] p-3 transition hover:border-rose-500/30 hover:bg-[#0c1624] flex flex-col cursor-pointer">
                            <span className="text-sm font-semibold text-rose-300">{alert.alert_type.replace('_', ' ').toUpperCase()}</span>
                            <span className="text-xs text-slate-500 mt-1">{new Date(alert.created_at).toLocaleTimeString()}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
