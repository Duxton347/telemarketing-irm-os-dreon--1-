
import React from 'react';
import {
  PhoneCall, Clock, AlertCircle, TrendingUp, BarChart3, Users, ClipboardList, Filter, X, ChevronRight, MessageCircle, UserCheck, PhoneForwarded, Loader2, Eye, FileText, AlertTriangle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as PieTooltip
} from 'recharts';
import { dataService } from '../services/dataService';
import { UserRole, CallType, ProtocolStatus, User, Protocol, Client, Question, Task, ScheduleStatus } from '../types';
import { useNavigate } from 'react-router-dom';
import { RepiqueModal, RepiqueData } from '../components/RepiqueModal';

interface DashboardProps {
  user: any;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  if (!user) {
    console.error("Dashboard: User is undefined");
    return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  const navigate = useNavigate();
  const [operators, setOperators] = React.useState<User[]>([]);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [urgentProtocols, setUrgentProtocols] = React.useState<Protocol[]>([]);
  const [selectedFilter, setSelectedFilter] = React.useState<string>(user?.role === UserRole.OPERATOR ? user.id : 'all');

  // Modal States
  const [activeModal, setActiveModal] = React.useState<'calls' | 'queue' | 'time' | null>(null);
  const [detailedData, setDetailedData] = React.useState<any[]>([]);
  const [isModalLoading, setIsModalLoading] = React.useState(false);
  const [selectedAuditCall, setSelectedAuditCall] = React.useState<any>(null);

  const [stats, setStats] = React.useState({
    totalCalls: 0,
    pendingTasks: 0,
    openProtocolsCount: 0,
    avgCallTime: '0m 0s',
  });

  const [chartData, setChartData] = React.useState<any[]>([]);
  const [protocolData, setProtocolData] = React.useState<any[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);

  // Repique State
  const [isRepiqueModalOpen, setIsRepiqueModalOpen] = React.useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [isProcessingRepique, setIsProcessingRepique] = React.useState(false);

  // Constants for Dashboard View
  const fetchBaseData = React.useCallback(async () => {
    const filterId = user?.role === UserRole.OPERATOR ? user.id : selectedFilter;
    const taskFilter = filterId === 'all' ? undefined : filterId;

    const [calls, protocols, tasks, allUsers, allQuestions, waTasks] = await Promise.all([
      dataService.getCalls(),
      dataService.getProtocols(),
      dataService.getTasks(taskFilter),
      dataService.getUsers(),
      dataService.getQuestions(),
      dataService.getWhatsAppTasks(taskFilter) // Fetch all pending WA tasks
    ]);

    setOperators(allUsers.filter(u => u && u.active !== false));
    setQuestions(allQuestions);
    setTasks(tasks);

    const todayStr = new Date().toISOString().split('T')[0];

    const displayCalls = (filterId === 'all' ? calls : calls.filter(c => c.operatorId === filterId))
      .filter(c => c.startTime && c.startTime.startsWith(todayStr))
      .filter(c => c.type !== CallType.WHATSAPP);

    const now = new Date(); // Current time for filtering
    const isActionableVoiceTask = (task: Task) =>
      !!task.assignedTo &&
      task.status === 'pending' &&
      (task.approvalStatus === 'APPROVED' || !task.approvalStatus);

    const displayTasks = (filterId === 'all'
      ? tasks.filter(isActionableVoiceTask)
      : tasks.filter(t => t.assignedTo === filterId && isActionableVoiceTask(t)))
      .filter(t => !t.scheduledFor || new Date(t.scheduledFor) <= now); // Exclude future tasks

    const isActionableWaTask = (task: any) => !!task.assignedTo && task.status === 'pending';
    const displayWaTasks = filterId === 'all' 
      ? waTasks.filter(isActionableWaTask)
      : waTasks.filter(w => w.assignedTo === filterId && isActionableWaTask(w));

    const totalPending = displayTasks.length + displayWaTasks.length;

    const displayProtocols = filterId === 'all' ? protocols : protocols.filter(p => p.ownerOperatorId === filterId || p.openedByOperatorId === filterId);

    // Protocolos Urgentes (Abertos ou Reabertos)
    const urgent = displayProtocols.filter(p =>
      p.status === ProtocolStatus.ABERTO ||
      p.status === ProtocolStatus.REABERTO ||
      (user.role === UserRole.ADMIN && p.status === ProtocolStatus.RESOLVIDO_PENDENTE)
    );
    setUrgentProtocols(urgent);

    const totalDur = displayCalls.reduce((acc, c) => acc + (c.duration || 0), 0);
    const avgSec = displayCalls.length > 0 ? Math.floor(totalDur / displayCalls.length) : 0;

    setStats({
      totalCalls: displayCalls.length,
      pendingTasks: totalPending,
      openProtocolsCount: displayProtocols.filter(p => p.status !== ProtocolStatus.FECHADO).length,
      avgCallTime: `${Math.floor(avgSec / 60)}m ${avgSec % 60}s`,
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('pt-BR', { weekday: 'short' });
    }).reverse();

    setChartData(last7Days.map(day => {
      const dayCalls = (filterId === 'all' ? calls : calls.filter(c => c.operatorId === filterId))
        .filter(c => new Date(c.startTime).toLocaleDateString('pt-BR', { weekday: 'short' }) === day);
      return {
        name: day,
        venda: dayCalls.filter(c => c.type === CallType.VENDA).length,
        posVenda: dayCalls.filter(c => c.type === CallType.POS_VENDA).length,
        prospeccao: dayCalls.filter(c => c.type === CallType.PROSPECCAO).length,
      };
    }));

    setProtocolData([
      { name: 'Aberto', value: displayProtocols.filter(p => p.status === ProtocolStatus.ABERTO).length },
      { name: 'Andamento', value: displayProtocols.filter(p => p.status === ProtocolStatus.EM_ANDAMENTO).length },
      { name: 'Fechado', value: displayProtocols.filter(p => p.status === ProtocolStatus.FECHADO).length },
    ].filter(i => i.value > 0));

  }, [user, selectedFilter]);

  React.useEffect(() => {
    fetchBaseData();
    const interval = setInterval(fetchBaseData, 30000);
    return () => clearInterval(interval);
  }, [fetchBaseData]);

  const openDetails = async (type: 'calls' | 'queue' | 'time') => {
    setIsModalLoading(true);
    setActiveModal(type);
    try {
      if (type === 'calls' || type === 'time') {
        const data = await dataService.getDetailedCallsToday();
        setDetailedData(data);
      } else if (type === 'queue') {
        const data = await dataService.getDetailedPendingTasks();
        setDetailedData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsModalLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, onClick }: any) => (
    <button
      onClick={onClick}
      className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-100 flex items-start justify-between hover:shadow-xl hover:-translate-y-1 transition-all group text-left w-full active:scale-95"
    >
      <div>
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2 group-hover:text-slate-600 transition-colors">{title}</p>
        <h3 className="text-4xl font-black text-slate-900">{value}</h3>
      </div>
      <div className={`p-5 rounded-[24px] ${color} shadow-2xl shadow-black/10 group-hover:scale-110 transition-transform`}>
        <Icon size={28} className="text-white" />
      </div>
    </button>
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Irmãos Dreon Performance</h2>
          <p className="text-slate-500 font-bold">Relatório operacional em tempo real.</p>
        </div>
        {user?.role === UserRole.ADMIN && (
          <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-[24px] border border-slate-200 shadow-sm">
            <Filter size={18} className="text-slate-400" />
            <select value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)} className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-slate-700 cursor-pointer">
              <option value="all">Visão Consolidada</option>
              {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
            </select>
          </div>
        )}
      </header>

      {/* SEÇÃO DE PROTOCOLOS URGENTES - DESTAQUE VERMELHO BRILHANTE */}
      {urgentProtocols.length > 0 && (
        <div className="bg-red-600 rounded-[48px] p-1 shadow-2xl shadow-red-500/50 animate-pulse transition-all">
          <div className="bg-white rounded-[44px] p-8 space-y-6">
            <div className="flex items-center gap-4 text-red-600">
              <AlertTriangle size={32} className="animate-bounce" />
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Protocolos Críticos Pendentes</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atenção imediata necessária nestes registros</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {urgentProtocols.slice(0, 3).map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate('/protocols')}
                  className="p-6 bg-red-50 border-2 border-red-200 rounded-[32px] text-left hover:bg-red-100 transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="bg-red-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">{p.status}</span>
                    <ChevronRight className="text-red-300 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-black text-slate-800 text-sm line-clamp-1">{p.title}</h4>
                  <p className="text-[10px] font-bold text-red-400 mt-2 uppercase tracking-widest">#{p.protocolNumber || p.id.substring(0, 8)}</p>
                </button>
              ))}
              {urgentProtocols.length > 3 && (
                <button onClick={() => navigate('/protocols')} className="bg-slate-100 rounded-[32px] flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-200 transition-all">
                  + {urgentProtocols.length - 3} outros pendentes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard onClick={() => openDetails('calls')} title="Ligações de Hoje" value={stats.totalCalls} icon={PhoneCall} color="bg-blue-600" />
        <StatCard onClick={() => openDetails('queue')} title="Fila Pendente" value={stats.pendingTasks} icon={ClipboardList} color="bg-yellow-500" />
        <StatCard onClick={() => navigate('/protocols')} title="Protocolos Ativos" value={stats.openProtocolsCount} icon={AlertCircle} color="bg-red-500" />
        <StatCard onClick={() => openDetails('time')} title="Média de Tempo" value={stats.avgCallTime} icon={Clock} color="bg-slate-900" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-12 rounded-[56px] border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-12">
            <h3 className="font-black text-slate-900 text-[11px] uppercase tracking-widest flex items-center gap-3">
              <TrendingUp size={22} className="text-blue-600" /> Fluxo de Atendimento por Categoria
            </h3>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 900 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 900 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)' }} />
                <Bar dataKey="posVenda" stackId="a" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="venda" stackId="a" fill="#2563eb" radius={[2, 2, 0, 0]} />
                <Bar dataKey="prospeccao" stackId="a" fill="#f59e0b" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-12 rounded-[56px] border border-slate-100 shadow-sm flex flex-col items-center">
          <h3 className="font-black text-slate-900 text-[11px] uppercase tracking-widest mb-12 self-start flex items-center gap-3">
            <BarChart3 size={22} className="text-indigo-600" /> Eficiência de Protocolos
          </h3>
          <div className="w-full h-[260px]">
            {protocolData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={protocolData} cx="50%" cy="50%" innerRadius={75} outerRadius={100} paddingAngle={12} dataKey="value">
                    <Cell fill="#ef4444" />
                    <Cell fill="#f59e0b" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <PieTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20 text-slate-400">
                <BarChart3 size={60} />
                <p className="text-[10px] font-black uppercase mt-4 tracking-widest">Aguardando dados</p>
              </div>
            )}
          </div>
          <div className="mt-8 flex gap-4">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div><span className="text-[9px] font-black text-slate-400 uppercase">Abertos</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div><span className="text-[9px] font-black text-slate-400 uppercase">Em Curso</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div><span className="text-[9px] font-black text-slate-400 uppercase">Resolvidos</span></div>
          </div>
        </div>
      </div>

      {/* TEAM STATUS SECTION */}
      <div className="mt-8">
        <h3 className="font-black text-slate-900 text-[11px] uppercase tracking-widest mb-6 flex items-center gap-3">
          <Users size={22} className="text-blue-600" /> Status da Equipe
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {operators.map(op => {
            const now = new Date();
            const opTasks = tasks
              .filter(t => t.assignedTo === op.id && t.status === 'pending' && (t.approvalStatus === 'APPROVED' || !t.approvalStatus))
              .filter(t => !t.scheduledFor || new Date(t.scheduledFor) <= now);

            if (selectedFilter !== 'all' && op.id !== selectedFilter) return null;

            return (
              <div key={op.id} className={`bg-white rounded-[32px] p-6 border transition-all ${selectedTaskIds.some(id => opTasks.find(t => t.id === id)) ? 'border-blue-500 shadow-xl shadow-blue-500/10' : 'border-slate-100 shadow-sm hover:shadow-md'}`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl font-black text-slate-700 shadow-inner">
                      {op.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg">{op.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`w-2 h-2 rounded-full ${op.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{op.active ? 'Online' : 'Offline'}</p>
                      </div>
                    </div>
                  </div>
                  {opTasks.length > 0 && (
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm">
                      {opTasks.length}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fila Pendente</span>
                    <button
                      onClick={() => {
                        const ids = opTasks.map(t => t.id);
                        const allSelected = ids.every(id => selectedTaskIds.includes(id));
                        if (allSelected) {
                          setSelectedTaskIds(prev => prev.filter(id => !ids.includes(id)));
                        } else {
                          setSelectedTaskIds(prev => [...new Set([...prev, ...ids])]);
                        }
                      }}
                      className="text-[10px] font-black uppercase text-blue-600 hover:underline"
                    >
                      Selecionar Todos
                    </button>
                  </div>

                  <div className="mt-4 max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {opTasks.length > 0 ? opTasks.map(t => (
                      <div key={t.id} className={`flex items-center justify-between p-3 border rounded-xl hover:border-blue-200 group transition-all ${selectedTaskIds.includes(t.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                        <div className="flex items-center gap-3 overflow-hidden">
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(t.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedTaskIds(prev => [...prev, t.id]);
                              else setSelectedTaskIds(prev => prev.filter(id => id !== t.id));
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{t.clientName || 'Cliente Desconhecido'}</p>
                            <p className="text-[10px] font-bold text-slate-400">{new Date(t.deadline).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${t.type === CallType.VENDA ? 'bg-emerald-100 text-emerald-600' :
                          t.type === CallType.POS_VENDA ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                          }`}>{t.type?.substring(0, 3)}</span>
                      </div>
                    )) : (
                      <p className="text-center text-[10px] font-bold text-slate-300 py-4 uppercase tracking-widest">Sem tarefas</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL AUDITORIA DETALHADA ADMIN */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[56px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-4">
                  {activeModal === 'calls' || activeModal === 'time' ? <PhoneCall className="text-blue-400" /> : <ClipboardList className="text-yellow-400" />}
                  {activeModal === 'calls' ? 'Auditoria de Ligações Hoje' : activeModal === 'time' ? 'Ranking de Duração' : 'Fila Pendente'}
                </h3>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Visão Total do Administrador</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-4 hover:bg-white/10 rounded-full transition-all active:scale-90"><X size={32} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              {isModalLoading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-300">
                  <Loader2 className="animate-spin" size={48} />
                  <p className="font-black uppercase text-[10px] tracking-widest">Sincronizando Dados...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {detailedData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Cliente / Entidade</th>
                            <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Operador</th>
                            <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Duração</th>
                            <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Relatório / Questionário</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {detailedData.map((item, idx) => (
                            <tr key={idx} className="group hover:bg-slate-50 transition-all">
                              <td className="py-6 px-4">
                                <p className="font-black text-slate-800 text-lg">{item.clients?.name}</p>
                                <span className="text-[10px] font-black text-blue-500 uppercase">{item.clients?.phone}</span>
                                <div className="flex gap-1 mt-1">
                                  {item.clients?.items?.map((it: string) => (
                                    <span key={it} className="bg-slate-100 text-[8px] font-black uppercase px-2 py-0.5 rounded-md">{it}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-6 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs">{item.profiles?.username_display?.charAt(0)}</div>
                                  <span className="font-bold text-slate-700">{item.profiles?.username_display}</span>
                                </div>
                              </td>
                              <td className="py-6 px-4">
                                <div className="font-black text-slate-900 flex items-center gap-2">
                                  <Clock size={14} className="text-slate-300" />
                                  {Math.floor(item.duration / 60)}m {item.duration % 60}s
                                </div>
                              </td>
                              <td className="py-6 px-4">
                                <button
                                  onClick={() => setSelectedAuditCall(item)}
                                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                                >
                                  <Eye size={14} /> Ver Auditoria Completa
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs opacity-50">Sem ligações registradas hoje.</div>
                  )}
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button onClick={() => setActiveModal(null)} className="px-10 py-4 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-2xl active:scale-95 transition-all">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHE DA LIGAÇÃO (Auditoria Questionário) */}
      {selectedAuditCall && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4 animate-in fade-in zoom-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[56px] shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Ficha de Auditoria</h3>
                <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mt-1">
                  {selectedAuditCall.clients?.name} &bull; Operador: {selectedAuditCall.profiles?.username_display}
                </p>
              </div>
              <button onClick={() => setSelectedAuditCall(null)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
              <section className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                  <FileText className="text-blue-600" size={20} /> Relatório Escrito do Operador
                </h4>
                <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 text-slate-800 font-bold italic whitespace-pre-wrap leading-relaxed">
                  {selectedAuditCall.responses?.written_report || "Nenhum relatório escrito registrado."}
                </div>
              </section>

              <section className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                  <ClipboardList className="text-indigo-600" size={20} /> Respostas do Questionário
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedAuditCall.responses || {}).filter(([k]) => k !== 'written_report' && k !== 'call_type' && !k.endsWith('_note')).map(([qId, response]: any) => {
                    const question = questions.find(q => q.id === qId || q.id.toLowerCase() === qId.toLowerCase());
                    const label = question ? `${question.order}. ${question.text}` : qId.toUpperCase();
                    return (
                      <div key={qId} className="p-6 bg-white border border-slate-100 rounded-[28px] shadow-sm flex flex-col justify-between">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-4 leading-tight">{label}</p>
                        <span className={`self-start px-4 py-2 rounded-xl text-xs font-black uppercase shadow-sm ${response === 'Ótimo' || response === 'Sim' || response === 'Atendeu' ? 'bg-green-600 text-white' :
                          response === 'Ruim' || response === 'Não' || response === 'Não atendeu' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
                          }`}>
                          {response}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Duração</p>
                  <p className="font-black text-slate-900">{Math.floor(selectedAuditCall.duration / 60)}m {selectedAuditCall.duration % 60}s</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Preenchimento</p>
                  <p className="font-black text-slate-900">{Math.floor(selectedAuditCall.report_time / 60)}m {selectedAuditCall.report_time % 60}s</p>
                </div>
              </div>
              <button onClick={() => setSelectedAuditCall(null)} className="px-10 py-4 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-2xl active:scale-95 transition-all">Concluído</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions Floating Bar */}
      {selectedTaskIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-10 fade-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-10">
          <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
            <span className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-black text-xs">{selectedTaskIds.length}</span>
            <span className="font-bold text-sm">Selecionados</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsRepiqueModalOpen(true)}
              className="flex items-center gap-2 hover:text-blue-200 transition-colors font-bold text-sm uppercase tracking-wider"
            >
              <Clock size={18} /> Solicitar Repique
            </button>
            <button
              onClick={() => setSelectedTaskIds([])}
              className="flex items-center gap-2 hover:text-red-200 transition-colors font-bold text-sm uppercase tracking-wider ml-4"
            >
              <X size={18} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Repique Modal */}
      <RepiqueModal
        isOpen={isRepiqueModalOpen}
        onClose={() => setIsRepiqueModalOpen(false)}
        selectedCount={selectedTaskIds.length}
        isProcessing={isProcessingRepique}
        onConfirm={async (data: RepiqueData) => {
          setIsProcessingRepique(true);
          try {
            const tasksToRepique = await dataService.getTasks(); // We need details of selected tasks
            const selectedTasks = tasksToRepique.filter(t => selectedTaskIds.includes(t.id));

            const schedules = selectedTasks.map(t => ({
              customerId: t.clientId,
              requestedByOperatorId: user.id, // Who requested? The logged in user (Admin/Manager)
              assignedOperatorId: t.assignedTo, // Keep assigned to same operator
              scheduledFor: `${data.date}T${data.time}:00`,
              callType: t.type,
              status: 'PENDENTE_APROVACAO' as ScheduleStatus, // Always require approval for repicks
              scheduleReason: data.reason,
              resolutionChannel: data.contactType === 'whatsapp' ? 'whatsapp' : 'telefone',
              hasRepick: true
            }));

            await dataService.bulkCreateScheduleRequest(schedules);

            // If it's a "Repique", we might want to remove them from the current queue?
            // For now, let's just create the schedule. The tasks remain pending until completed or explicitly removed.

            setSelectedTaskIds([]);
            setIsRepiqueModalOpen(false);
            fetchBaseData();
          } catch (error) {
            console.error(error);
            alert('Erro ao processar repique.');
          } finally {
            setIsProcessingRepique(false);
          }
        }}
      />
    </div>
  );
};

export default Dashboard;
