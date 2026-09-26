import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserCircle2,
  Heart,
  ClipboardList,
  Sparkles,
  Smartphone,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/profiles', label: 'Profiles', icon: UserCircle2 },
  { to: '/matches', label: 'Matches', icon: Heart },
  { to: '/questionnaires', label: 'Questionnaires', icon: ClipboardList },
  { to: '/horoscopes', label: 'Horoscopes', icon: Sparkles },
  { to: '/device-tokens', label: 'Device Tokens', icon: Smartphone },
]

const Sidebar = () => (
  <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white">
    <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
      <img
        src="/WhatsApp_Image_2026-09-23_at_1.22.22_PM-removebg-preview.png"
        alt="Astro Admin logo"
        className="h-8 w-8 object-contain"
      />
      <span className="text-lg font-bold text-slate-900">Astro Admin</span>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  </aside>
)

export default Sidebar