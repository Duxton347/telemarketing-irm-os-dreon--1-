import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bell,
  Calendar,
  CalendarClock,
  ClipboardList,
  Database,
  FileBarChart,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageCircle,
  PhoneCall,
  Settings,
  ShoppingBag,
  Target,
  Upload,
  Users,
  X
} from 'lucide-react';
import { UserRole } from '../types';
import { useNotifications } from './NotificationProvider';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const location = useLocation();
  const { unreadCount, togglePanel } = useNotifications();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Atendimento', icon: PhoneCall, path: '/queue', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Vendas', icon: ShoppingBag, path: '/sales', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Clientes', icon: Users, path: '/clients', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Protocolos', icon: ClipboardList, path: '/protocols', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Agenda', icon: Calendar, path: '/calendar', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Repiques', icon: CalendarClock, path: '/repiques', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Prospeccao', icon: Target, path: '/prospects', roles: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR] },
    { label: 'Captacao', icon: Globe, path: '/scraper', roles: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR] },
    { label: 'Orcamentos', icon: FileText, path: '/quotes', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Roteiros', icon: Map, path: '/routes', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Gestao', icon: Settings, path: '/admin', roles: [UserRole.ADMIN] },
    { label: 'Relatorios', icon: FileBarChart, path: '/reports', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    { label: 'Exportar/Carga', icon: Upload, path: '/workload', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    { label: 'Central de Dados', icon: Database, path: '/data-center', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    { label: 'Planejar Campanhas', icon: Target, path: '/campaigns', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] }
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-white p-4">
        <div className="mb-8 px-2 py-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-yellow-400 leading-tight">Irmaos Dreon</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Telemarketing</p>
        </div>

        <nav className="flex-1 space-y-1">
          {filteredNav.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-700">
          <div className="px-3 py-3 mb-4">
            <p className="text-sm font-semibold truncate">{user.name}</p>
            <p className="text-xs text-slate-400 capitalize">{String(user.role || '').toLowerCase()}</p>
          </div>
          <button
            onClick={togglePanel}
            className="relative mb-3 flex items-center justify-between w-full px-3 py-3 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center space-x-3">
              <Bell size={20} />
              <span className="font-medium">Notificacoes</span>
            </span>
            {unreadCount > 0 && (
              <span className="min-w-6 rounded-full bg-orange-500 px-2 py-1 text-center text-[10px] font-black text-white">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={onLogout}
            className="flex items-center space-x-3 w-full px-3 py-3 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50">
        <span className="font-bold text-yellow-400">Irmaos Dreon</span>
        <div className="flex items-center gap-3">
          <button onClick={togglePanel} className="relative">
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black text-white text-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => setIsMobileMenuOpen(current => !current)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-900 pt-16 p-4">
          <nav className="space-y-2">
            {filteredNav.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-4 py-4 rounded-lg text-slate-300 hover:bg-slate-800"
                >
                  <Icon size={24} />
                  <span className="text-lg">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={onLogout}
              className="flex items-center space-x-3 w-full px-4 py-4 rounded-lg text-red-400"
            >
              <LogOut size={24} />
              <span className="text-lg font-medium">Sair</span>
            </button>
          </nav>
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto max-w-full">
        {children}
      </main>
    </div>
  );
};

export default Layout;
