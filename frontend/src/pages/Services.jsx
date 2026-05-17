import React from 'react';
import {
  ShoppingCart, Shield, Building2, Utensils, Factory, HeartPulse,
  Users, Bell, FileBarChart2, Video, Map, Mail, Cpu, CheckCircle2,
  Phone, Globe, Zap,
} from 'lucide-react';

const sectors = [
  {
    icon: ShoppingCart,
    title: 'Retail & Supershop',
    color: 'cyan',
    items: [
      'Customer footfall counting (entry/exit)',
      'Peak hour analytics & heatmap',
      'Shelf & zone visitor tracking',
      'Shoplifting / suspicious behaviour alert',
      'Carrying object detection (bag, bottle, cart)',
    ],
  },
  {
    icon: Shield,
    title: 'Security & Surveillance',
    color: 'rose',
    items: [
      '24/7 live multi-camera monitoring',
      'Intrusion & restricted zone alert',
      'Incident snapshot evidence capture',
      'Weekly & monthly security reports',
      'Email alert on critical events',
    ],
  },
  {
    icon: Building2,
    title: 'Office & Corporate',
    color: 'violet',
    items: [
      'Entry/exit log with timestamps',
      'Person count per hour / day',
      'Restricted area breach alert',
      'Daily attendance summary report',
      'Zone-wise occupancy monitoring',
    ],
  },
  {
    icon: Utensils,
    title: 'Restaurant & Food Court',
    color: 'amber',
    items: [
      'Table occupancy monitoring',
      'Queue length detection',
      'Peak service hour analytics',
      'Customer dwell time tracking',
      'Area crowd density alert',
    ],
  },
  {
    icon: Factory,
    title: 'Warehouse & Factory',
    color: 'emerald',
    items: [
      'Worker presence & zone tracking',
      'Safety zone compliance monitoring',
      'Vehicle / forklift movement detection',
      'Shift-wise headcount report',
      'Unauthorised area alert',
    ],
  },
  {
    icon: HeartPulse,
    title: 'Hospital & Clinic',
    color: 'sky',
    items: [
      'Waiting area crowd monitoring',
      'Restricted zone access alert',
      'Patient flow analytics',
      'Hourly footfall report',
      'Emergency area surveillance',
    ],
  },
];

const features = [
  { icon: Video, label: 'Multi-Camera Live Feed', desc: 'Monitor unlimited cameras simultaneously from one dashboard.' },
  { icon: Cpu, label: 'AI Object Detection', desc: 'YOLO-based real-time detection — persons, vehicles, objects.' },
  { icon: Bell, label: 'Instant Alerts', desc: 'Automated alerts on suspicious events with snapshot evidence.' },
  { icon: FileBarChart2, label: 'Daily / Weekly / Monthly Reports', desc: 'Auto-generated reports downloadable as Excel or sent via email.' },
  { icon: Map, label: 'Zone Management', desc: 'Define custom zones and track activity per zone independently.' },
  { icon: Mail, label: 'Email Report Delivery', desc: 'Scheduled reports delivered to your inbox automatically.' },
  { icon: Users, label: 'Person Tracking', desc: 'Track individual persons across frames using unique track IDs.' },
  { icon: Globe, label: 'Web-Based Dashboard', desc: 'Access from any browser — no app install required.' },
];

const colorMap = {
  cyan:    { border: 'border-cyan-500/25',   bg: 'bg-cyan-500/10',   icon: 'text-cyan-400',   dot: 'bg-cyan-400' },
  rose:    { border: 'border-rose-500/25',   bg: 'bg-rose-500/10',   icon: 'text-rose-400',   dot: 'bg-rose-400' },
  violet:  { border: 'border-violet-500/25', bg: 'bg-violet-500/10', icon: 'text-violet-400', dot: 'bg-violet-400' },
  amber:   { border: 'border-amber-500/25',  bg: 'bg-amber-500/10',  icon: 'text-amber-400',  dot: 'bg-amber-400' },
  emerald: { border: 'border-emerald-500/25',bg: 'bg-emerald-500/10',icon: 'text-emerald-400',dot: 'bg-emerald-400' },
  sky:     { border: 'border-sky-500/25',    bg: 'bg-sky-500/10',    icon: 'text-sky-400',    dot: 'bg-sky-400' },
};

export default function Services() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-10">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#07111e] to-[#0b1a2e] px-8 py-10 shadow-[0_0_60px_rgba(6,182,212,0.08)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-violet-500/5 blur-3xl" />
        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">
            <Zap className="h-3 w-3" /> AI-Powered Platform
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Smart Surveillance &<br />
            <span className="text-cyan-400">Analytics Solutions</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            MetroNet Bangladesh Ltd delivers an end-to-end AI tracking platform — real-time object detection,
            multi-camera monitoring, automated reporting, and intelligent alerts — deployable at any scale
            across retail, security, corporate, and industrial environments.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="tel:+8801XXXXXXXXX" className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-500">
              <Phone className="h-4 w-4" /> Contact Sales
            </a>
            <a href="mailto:info@metronet.com.bd" className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-bold text-cyan-300 transition hover:bg-cyan-500/20">
              <Mail className="h-4 w-4" /> Email Us
            </a>
          </div>
        </div>
      </div>

      {/* Core Features */}
      <div>
        <div className="mb-5 text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Platform Capabilities</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-cyan-500/12 bg-[#0b1624] p-4 transition hover:border-cyan-500/30">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-bold text-slate-100">{label}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sectors */}
      <div>
        <div className="mb-5 text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Industries We Serve</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sectors.map(({ icon: Icon, title, color, items }) => {
            const c = colorMap[color];
            return (
              <div key={title} className={`rounded-xl border ${c.border} bg-[#0b1624] p-5 transition hover:shadow-[0_0_30px_rgba(0,0,0,0.3)]`}>
                <div className="mb-4 flex items-center gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl ${c.bg}`}>
                    <Icon className={`h-5 w-5 ${c.icon}`} />
                  </div>
                  <div className="text-sm font-black text-slate-100">{title}</div>
                </div>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-slate-400">
                      <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${c.icon}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-r from-[#0b1624] to-[#0a1a2e] p-8 text-center">
        <div className="text-xl font-black text-white">Ready to deploy at your facility?</div>
        <p className="mt-2 text-sm text-slate-400">Custom installation available across Bangladesh. On-site demo on request.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <a href="tel:+8801XXXXXXXXX" className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-cyan-500">
            <Phone className="h-4 w-4" /> Call Now
          </a>
          <a href="mailto:info@metronet.com.bd" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800">
            <Mail className="h-4 w-4" /> Send Enquiry
          </a>
        </div>
      </div>

    </div>
  );
}
