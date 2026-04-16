import React from 'react';

export default function ZoneHeatmap({ zoneCounts = {} }) {
    const entries = Object.entries(zoneCounts);
    const maxValue = Math.max(...entries.map(([, value]) => value), 1);

    if (entries.length === 0) {
        return <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-slate-500">No zone activity yet.</div>;
    }

    return (
        <div className="space-y-3">
            {entries.map(([zone, count]) => (
                <div key={zone} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-200">{zone}</span>
                        <span className="text-slate-500">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                            style={{ width: `${(count / maxValue) * 100}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
