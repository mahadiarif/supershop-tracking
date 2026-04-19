import React from 'react';
import { BrowserRouter, NavLink, Routes, Route } from 'react-router-dom';
import { Activity, Camera, Database, FileText, Grid2X2, LayoutDashboard, LogOut, Shield, Video } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Cameras from './pages/Cameras';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import SystemStatus from './pages/SystemStatus';
import Datasheet from './pages/Datasheet';
import Zones from './pages/Zones';

const navItems = [
  { to: '/', label: 'Live Camera', icon: LayoutDashboard },
  { to: '/cameras', label: 'Camera Config', icon: Camera },
  { to: '/alerts', label: 'Alerts', icon: Activity },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/datasheet', label: 'Data Sheet', icon: Database },
  { to: '/zones', label: 'Processing Zones', icon: Grid2X2 },
  { to: '/system', label: 'System Status', icon: Shield },
];

function SidebarLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200',
          isActive
            ? 'bg-cyan-700/30 text-cyan-200 border border-cyan-500/40 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80',
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
}

function MobileNavLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition-all duration-200',
          isActive ? 'bg-cyan-700/25 text-cyan-200' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100',
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-[#06111d] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col border-r border-cyan-500/10 bg-[#08101a] px-4 py-5 shadow-[0_0_40px_rgba(0,0,0,0.35)] lg:flex">
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-cyan-400/10 bg-gradient-to-br from-cyan-500/15 to-blue-500/5 px-4 py-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-600 text-[#06111d] shadow-lg shadow-cyan-500/20">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-black tracking-[0.25em] text-cyan-100">METRONET</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.45em] text-cyan-400/70">AI Surveillance</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Status</div>
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">
              System Live
            </div>
          </div>

          <div className="mb-3 mt-2 text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Main</div>
          <nav className="space-y-2">
            {navItems.slice(0, 2).map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="mb-3 mt-6 text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">Config</div>
          <nav className="space-y-2">
            {navItems.slice(2).map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="mt-auto pt-6">
            <button className="flex w-full items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-cyan-500/10 bg-[#07101a]/90 px-4 py-3 backdrop-blur xl:px-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 text-[#06111d] lg:hidden">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-black tracking-[0.04em] text-slate-100 sm:text-base">Smart Surveillance View</div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-cyan-400/70 lg:hidden">METRONET AI</div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden text-xs font-mono text-slate-400 md:block">LIVE</div>
              <div className="flex items-center gap-2 rounded-full border border-cyan-500/20 bg-slate-900/70 px-2.5 py-1.5 sm:px-3">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-xs font-black text-white">
                  S
                </div>
                <span className="hidden text-sm font-semibold text-slate-100 sm:inline">Sentinel Admin</span>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-4 pb-24 xl:px-6 xl:pb-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cameras" element={<Cameras />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/datasheet" element={<Datasheet />} />
              <Route path="/zones" element={<Zones />} />
              <Route path="/system" element={<SystemStatus />} />
            </Routes>
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-500/10 bg-[#07101a]/96 px-3 py-2 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          {navItems.map((item) => (
            <MobileNavLink key={item.to} {...item} />
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
