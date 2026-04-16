import React from 'react';

export default function StatsCard({ title, value, icon, color }) {
    return (
        <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1624] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.25)] flex items-center">
            <div className={`rounded-xl p-3 text-white ${color} shadow-lg shadow-black/20`}>
                {icon}
            </div>
            <div className="ml-5">
                <h3 className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">{title}</h3>
                <p className="mt-2 text-3xl font-black tracking-[0.08em] text-cyan-300">{value}</p>
            </div>
        </div>
    );
}
