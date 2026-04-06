
import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  FileBarChart,
  ShoppingBag,
  Calendar,

  Map,
  MessageCircle,
  Globe,
  Target,
  Upload,
  FileUp,
  Sparkles,
  FileText,
  Database,
  BellRing
} from 'lucide-react';
import { UserRole } from '../types';
import { dataService } from '../services/dataService';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission | 'unsupported'>(
    notificationsSupported ? Notification.permission : 'unsupported'
  );
  const [isEnablingNotifications, setIsEnablingNotifications] = React.useState(false);
  const seenAlertsRef = React.useRef<Set<string>>(new Set());
  const seenAlertsStorageKey = React.useMemo(
    () => `dreon_seen_task_alerts_${user?.id || 'anonymous'}`,
    [user?.id]
  );

  React.useEffect(() => {
    if (!notificationsSupported) {
      setNotificationPermission('unsupported');
      return;
    }

    setNotificationPermission(Notification.permission);
  }, [notificationsSupported]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(seenAlertsStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      seenAlertsRef.current = new Set(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('Failed to load seen task alerts:', error);
      seenAlertsRef.current = new Set();
    }
  }, [seenAlertsStorageKey]);

  const persistSeenAlerts = React.useCallback(() => {
    try {
      const seenIds = Array.from(seenAlertsRef.current).slice(-200);
      localStorage.setItem(seenAlertsStorageKey, JSON.stringify(seenIds));
    } catch (error) {
      console.error('Failed to persist seen task alerts:', error);
    }
  }, [seenAlertsStorageKey]);

  const enableBrowserNotifications = React.useCallback(async () => {
    if (!notificationsSupported) {
      alert('Seu navegador nao suporta notificacoes.');
      return;
    }

    setIsEnablingNotifications(true);

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'denied') {
        alert('As notificacoes foram bloqueadas. Libere nas permissoes do navegador para receber os avisos.');
      }
    } finally {
      setIsEnablingNotifications(false);
    }
  }, [notificationsSupported]);

  React.useEffect(() => {
    if (!user?.id || user.role === UserRole.ADMIN) {
      return;
    }

    let cancelled = false;

    const pollTaskAlerts = async () => {
      try {
        const alerts = await dataService.getTaskBrowserAlerts(user.id);

        if (cancelled || !notificationsSupported || notificationPermission !== 'granted') {
          return;
        }

        const unseenAlerts = alerts
          .filter(alert => !seenAlertsRef.current.has(alert.id))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (unseenAlerts.length === 0) {
          return;
        }

        unseenAlerts.forEach(alert => {
          const notification = new Notification('Tarefa pendente aguardando voce', {
            body: alert.message,
            tag: `dreon-task-alert-${alert.id}`
          });

          notification.onclick = () => {
            window.focus();
            navigate(alert.route);
            notification.close();
          };

          seenAlertsRef.current.add(alert.id);
        });

        persistSeenAlerts();
      } catch (error) {
        console.error('Failed to poll browser task alerts:', error);
      }
    };

    pollTaskAlerts();
    const intervalId = window.setInterval(pollTaskAlerts, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [navigate, notificationPermission, notificationsSupported, persistSeenAlerts, user?.id, user?.role]);

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Atendimento', icon: PhoneCall, path: '/queue', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Vendas', icon: ShoppingBag, path: '/sales', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Clientes', icon: Users, path: '/clients', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Protocolos', icon: ClipboardList, path: '/protocols', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Agenda', icon: Calendar, path: '/calendar', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Prospecção', icon: Target, path: '/prospects', roles: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR] },
    { label: 'Captação', icon: Globe, path: '/scraper', roles: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR] },

    { label: 'Orçamentos', icon: FileText, path: '/quotes', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Roteiros', icon: Map, path: '/routes', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPERVISOR] },
    { label: 'Gestão', icon: Settings, path: '/admin', roles: [UserRole.ADMIN] },
    { label: 'Relatórios', icon: FileBarChart, path: '/reports', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    { label: 'Exportar/Carga', icon: Upload, path: '/workload', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    { label: 'Central de Dados', icon: Database, path: '/data-center', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    { label: 'Planejar Campanhas', icon: Target, path: '/campaigns', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-white p-4">
        <div className="mb-8 px-2 py-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-yellow-400 leading-tight">Irmãos Dreon</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Telemarketing</p>
        </div>

        <nav className="flex-1 space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
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
            <p className="text-xs text-slate-400 capitalize">{user.role.toLowerCase()}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center space-x-3 w-full px-3 py-3 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50">
        <span className="font-bold text-yellow-400">Irmãos Dreon</span>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-900 pt-16 p-4">
          <nav className="space-y-2">
            {filteredNav.map((item) => {
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

      {/* Content */}
      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto max-w-full">
        {user.role !== UserRole.ADMIN && notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
          <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <BellRing size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">Ative os avisos do navegador</p>
                <p className="text-xs font-bold text-slate-500">
                  Assim voce recebe o toque quando um supervisor clicar no sino de uma tarefa pendente para voce.
                </p>
              </div>
            </div>
            <button
              onClick={enableBrowserNotifications}
              disabled={isEnablingNotifications}
              className="px-5 py-3 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all disabled:opacity-50"
            >
              {isEnablingNotifications ? 'Ativando...' : 'Ativar avisos'}
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default Layout;
