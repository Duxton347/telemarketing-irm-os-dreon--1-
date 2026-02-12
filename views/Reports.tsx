
import React from 'react';
import {
   BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
   Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts';
import {
   X, Loader2, AlertCircle, TrendingUp, Target, Heart, Filter, PhoneOff, Zap, BarChart3, CheckCircle2, ClipboardList, Timer, Phone, Eye, Trophy, Clock, SkipForward, ArrowUpRight, Activity, FileText, MapPin, Download, FileSpreadsheet
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { CallRecord, User, Client, Protocol, Question, ProtocolStatus, Task, OperatorEvent, OperatorEventType, Visit } from '../types';

const Reports: React.FC<{ user: any }> = ({ user }) => {
   const [isLoading, setIsLoading] = React.useState(true);
   const [isExporting, setIsExporting] = React.useState(false);
   const [activeTab, setActiveTab] = React.useState<'overview' | 'operators' | 'protocols' | 'deep_dive' | 'visits'>('overview');
   const [startDate, setStartDate] = React.useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
   const [endDate, setEndDate] = React.useState(new Date().toISOString().split('T')[0]);

   const [calls, setCalls] = React.useState<CallRecord[]>([]);
   const [protocols, setProtocols] = React.useState<Protocol[]>([]);
   const [tasks, setTasks] = React.useState<Task[]>([]);
   const [operators, setOperators] = React.useState<User[]>([]);
   const [clients, setClients] = React.useState<Client[]>([]);
   const [questions, setQuestions] = React.useState<Question[]>([]);
   const [operatorLogs, setOperatorLogs] = React.useState<OperatorEvent[]>([]);
   const [visits, setVisits] = React.useState<Visit[]>([]);

   const [stageStats, setStageStats] = React.useState<any[]>([]);
   const [detailedStats, setDetailedStats] = React.useState<any>(null);
   const [consolidatedIDE, setConsolidatedIDE] = React.useState(0);

   const [selectedAuditCall, setSelectedAuditCall] = React.useState<any>(null);
   const [drillDownData, setDrillDownData] = React.useState<{
      isOpen: boolean;
      title: string;
      filterLabel: string;
      data: any[];
      type: 'question' | 'protocol' | 'skip';
      selectedCallType?: string;
   }>({ isOpen: false, title: '', filterLabel: '', data: [], type: 'question' });

   const load = React.useCallback(async () => {
      setIsLoading(true);
      try {
         const [allCalls, allProtocols, allClients, allUsers, allQuestions, allTasks, allEvents, allVisits] = await Promise.all([
            dataService.getCalls(),
            dataService.getProtocols(),
            dataService.getClients(),
            dataService.getUsers(),
            dataService.getQuestions(),
            dataService.getTasks(),
            dataService.getOperatorEvents(startDate, endDate),
            dataService.getVisits()
         ]);

         const fCalls = allCalls.filter(c => {
            const d = c.startTime?.split('T')[0];
            return d && d >= startDate && d <= endDate;
         });

         const fTasks = allTasks.filter(t => {
            const d = t.deadline?.split('T')[0];
            return d && d >= startDate && d <= endDate;
         });

         const fProtos = allProtocols.filter(p => {
            const d = p.openedAt?.split('T')[0];
            return d && d >= startDate && d <= endDate;
         });

         setCalls(fCalls);
         setProtocols(fProtos);
         setTasks(fTasks);
         setOperators(allUsers);
         setClients(allClients);
         setQuestions(allQuestions);
         setOperatorLogs(allEvents);

         const fVisits = allVisits.filter(v => {
            const d = v.scheduledDate?.split('T')[0];
            return d && d >= startDate && d <= endDate;
         });
         setVisits(fVisits);

         setStageStats(await dataService.getStageAverages(fCalls));
         setDetailedStats(await dataService.getDetailedStats(fCalls, fProtos, fTasks));
         setConsolidatedIDE(await dataService.calculateIDE(fCalls));
      } catch (e) {
         console.error("Erro Reports:", e);
      } finally { setIsLoading(false); }
   }, [startDate, endDate]);

   React.useEffect(() => { load(); }, [load]);

   const handleExportCSV = () => {
      if (calls.length === 0) return alert("Não há chamadas atendidas no período para exportar.");
      setIsExporting(true);

      try {
         // 1. Organizar perguntas cadastradas para garantir colunas fixas
         const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

         // 2. Definir Cabeçalhos Tabulares
         const headers = [
            "DATA_LIGACAO",
            "HORA_LIGACAO",
            "CLIENTE",
            "TELEFONE",
            "OPERADOR",
            "TIPO_SERVICO",
            "DURACAO_CONVERSA",
            ...sortedQuestions.map(q => `RESPOSTA: ${q.text.toUpperCase().replace(/[;]/g, '')}`),
            "RELATORIO_FINAL_DO_OPERADOR"
         ];

         // 3. Mapear exclusivamente CHAMADAS CONCLUÍDAS (Realizadas)
         const rows = calls.map(call => {
            const client = clients.find(c => c.id === call.clientId);
            const operator = operators.find(o => o.id === call.operatorId);
            const dateObj = new Date(call.startTime);

            const dataStr = dateObj.toLocaleDateString('pt-BR');
            const horaStr = dateObj.toLocaleTimeString('pt-BR');

            // Mapear respostas em suas colunas exatas
            const qResponses = sortedQuestions.map(q => {
               const resp = dataService.getResponseValue(call.responses, q);
               // Retorna a resposta ou traço se não houver (ex: pergunta não se aplica ao tipo de chamada)
               return resp !== undefined ? `${String(resp).replace(/[;"]/g, '').trim()}` : '-';
            });

            // Higienizar o relatório final do operador
            const writtenReport = call.responses?.written_report
               ? String(call.responses.written_report)
                  .replace(/\n/g, ' ')
                  .replace(/\r/g, '')
                  .replace(/[;"]/g, "'")
                  .trim()
               : "Nenhum relatório preenchido";

            return [
               dataStr,
               horaStr,
               (client?.name || 'Venda Manual').replace(/[;"]/g, '').trim(),
               client?.phone || '-',
               (operator?.name || 'Excluído').replace(/[;"]/g, '').trim(),
               call.type,
               `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`,
               ...qResponses,
               writtenReport
            ].map(val => `"${val}"`).join(';'); // Delimitado por aspas e separado por ponto-e-vírgula
         });

         // 4. Montagem do Arquivo com BOM (Excel BR Friendly)
         const BOM = "\uFEFF";
         const csvContent = BOM + headers.join(';') + "\n" + rows.join('\n');

         // 5. Download Automático
         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
         const url = URL.createObjectURL(blob);
         const link = document.body.appendChild(document.createElement('a'));
         link.href = url;
         link.download = `Dreon_Relatorio_Atendimentos_${startDate}_a_${endDate}.csv`;
         link.click();
         document.body.removeChild(link);
         URL.revokeObjectURL(url);

      } catch (e) {
         console.error("Erro na exportação:", e);
         alert("Falha técnica ao gerar CSV.");
      } finally {
         setIsExporting(false);
      }
   };

   const operatorMetrics = React.useMemo(() => {
      if (!operators.length) return { ranking: [], tmaTimeline: [] };

      const opData: Record<string, any> = {};
      const tmaByDay: Record<string, { date: string, totalDur: number, count: number }> = {};

      operators.forEach(op => {
         if (op.role === 'ADMIN') return;

         const opEvents = operatorLogs.filter(e => e.operatorId === op.id);
         const opCalls = calls.filter(c => c.operatorId === op.id);
         const opCompleted = opCalls.length;
         const opSkips = tasks.filter(t => t.assignedTo === op.id && t.status === 'skipped').length;
         const totalAttempts = opCompleted + opSkips;

         const totalCallDur = opCalls.reduce((acc, c) => acc + (c.duration || 0), 0);
         const avgTma = opCompleted > 0 ? totalCallDur / opCompleted : 0;

         opCalls.forEach(c => {
            const day = c.startTime.split('T')[0];
            if (!tmaByDay[day]) tmaByDay[day] = { date: day, totalDur: 0, count: 0 };
            tmaByDay[day].totalDur += (c.duration || 0);
            tmaByDay[day].count += 1;
         });

         const gaps: number[] = [];
         let lastFinalizeTimestamp: number | null = null;
         const sortedEvents = [...opEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

         sortedEvents.forEach(evt => {
            if (evt.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO) {
               lastFinalizeTimestamp = new Date(evt.timestamp).getTime();
            } else if (lastFinalizeTimestamp && (evt.eventType === OperatorEventType.INICIAR_PROXIMO_ATENDIMENTO || evt.eventType === OperatorEventType.PULAR_ATENDIMENTO)) {
               const gapMs = new Date(evt.timestamp).getTime() - lastFinalizeTimestamp;
               if (gapMs > 0 && gapMs < 7200000) {
                  gaps.push(gapMs / 1000);
               }
               lastFinalizeTimestamp = null;
            }
         });

         const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
         const score = (opCompleted * 10) - ((avgGap / 60) * 5);

         opData[op.id] = {
            id: op.id,
            name: op.name,
            completed: opCompleted,
            skips: opSkips,
            tma: Math.round(avgTma),
            skipPercentage: totalAttempts > 0 ? Math.round((opSkips / totalAttempts) * 100) : 0,
            avgGap: Math.round(avgGap),
            maxGap: gaps.length > 0 ? Math.max(...gaps) : 0,
            score: Math.max(0, Math.round(score * 10) / 10)
         };
      });

      const ranking = Object.values(opData).sort((a, b) => b.score - a.score);
      const tmaTimeline = Object.values(tmaByDay)
         .sort((a, b) => a.date.localeCompare(b.date))
         .map(d => ({
            name: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            tma: Math.round(d.totalDur / d.count)
         }));

      return { ranking, tmaTimeline };
   }, [operators, operatorLogs, calls, tasks]);

   const deduplicatedAnalysis = React.useMemo(() => {
      if (!detailedStats?.questionAnalysis) return [];
      const map = new Map();
      const normalizeText = (str: string) => str ? str.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
      detailedStats.questionAnalysis.forEach((q: any) => {
         const current = map.get(q.order);
         const textNorm = normalizeText(q.text);
         if (!current) map.set(q.order, q);
         else {
            const isCorrect7 = q.order === 7 && textNorm.includes('insatisfacao');
            const isCorrect8 = q.order === 8 && textNorm.includes('explorado');
            if (isCorrect7 || isCorrect8) map.set(q.order, q);
         }
      });
      return Array.from(map.values()).sort((a, b) => a.order - b.order);
   }, [detailedStats]);

   const openAuditGrid = (question: Question, value?: string) => {
      const filtered = calls.filter(c => {
         const resp = dataService.getResponseValue(c.responses, question);
         if (!value) return resp !== undefined;
         return String(resp).trim().toLowerCase() === value.trim().toLowerCase();
      }).map(c => ({
         ...c,
         client: clients.find(cl => cl.id === c.clientId),
         operator: operators.find(op => op.id === c.operatorId),
      }));
      setDrillDownData({
         isOpen: true, title: question.text, filterLabel: value || 'Todos os Registros',
         data: filtered, type: 'question', selectedCallType: question.type === 'ALL' ? undefined : question.type
      });
   };

   const openProtocolDrillDown = (deptId: string, deptName: string) => {
      const filtered = protocols.filter(p => p.departmentId === deptId).map(p => ({
         ...p,
         client: clients.find(cl => cl.id === p.clientId),
         operator: operators.find(op => op.id === p.ownerOperatorId)
      }));
      setDrillDownData({ isOpen: true, title: `Protocolos: ${deptName}`, filterLabel: deptName, data: filtered, type: 'protocol' });
   };

   const openSkipDrillDown = (reason: string) => {
      const filtered = tasks.filter(t => t.status === 'skipped' && (t.skipReason || 'Não informado') === reason).map(t => ({
         ...t,
         client: clients.find(cl => cl.id === t.clientId),
         operator: operators.find(op => op.id === t.assignedTo)
      }));
      setDrillDownData({ isOpen: true, title: `Pulos Auditados: ${reason}`, filterLabel: reason, data: filtered, type: 'skip' });
   };

   const formatTime = (seconds: number) => {
      if (seconds < 60) return `${seconds}s`;
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
   };

   return (
      <div className="space-y-8 pb-20 relative animate-in fade-in duration-500">
         <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
               <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Relatórios Irmãos Dreon</h2>
               <p className="text-slate-500 font-bold mt-1">Inteligência operacional em tempo real.</p>
            </div>
            <div className="flex bg-white p-1.5 rounded-[24px] border border-slate-200 shadow-sm overflow-x-auto no-scrollbar shrink-0">
               {[
                  { id: 'overview', label: 'Score Global', icon: Target },
                  { id: 'operators', label: 'Operadores & Ranking', icon: Trophy },
                  { id: 'protocols', label: 'Setores & Pulos', icon: Timer },
                  { id: 'visits', label: 'Visitas e Rotas', icon: MapPin },
                  { id: 'deep_dive', label: 'Métricas Detalhadas', icon: Zap }
               ].map(tab => (
                  <button
                     key={tab.id}
                     onClick={() => setActiveTab(tab.id as any)}
                     className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                     <tab.icon size={14} /> {tab.label}
                  </button>
               ))}
            </div>
         </header>

         <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-3 space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtro Temporal</label>
               <div className="flex gap-2">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none" />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none" />
               </div>
            </div>
            <div className="lg:col-span-6 grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-blue-50 p-6 rounded-[32px] text-center border border-blue-100">
                  <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest mb-1">IDE Global</p>
                  <p className="text-3xl font-black text-blue-600">{consolidatedIDE}%</p>
               </div>
               <div className="bg-slate-900 p-6 rounded-[32px] text-center">
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Chamadas</p>
                  <p className="text-3xl font-black text-white">{calls.length}</p>
               </div>
               <div className="bg-red-50 p-6 rounded-[32px] text-center border border-red-100">
                  <p className="text-[9px] font-black uppercase text-red-400 tracking-widest mb-1">Fugas</p>
                  <p className="text-3xl font-black text-red-600">{tasks.filter(t => t.status === 'skipped').length}</p>
               </div>
            </div>
            <div className="lg:col-span-3 flex justify-end">
               <button
                  onClick={handleExportCSV}
                  disabled={isExporting || calls.length === 0}
                  className="w-full lg:w-auto px-8 py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-3 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-30"
               >
                  {isExporting ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />}
                  {isExporting ? 'Processando...' : 'Exportar Atendimentos'}
               </button>
            </div>
         </div>

         {isLoading ? (
            <div className="h-96 flex flex-col items-center justify-center text-slate-300 gap-4">
               <Loader2 className="animate-spin" size={64} />
               <p className="font-black uppercase text-xs tracking-[0.3em]">Extraindo Inteligência de Dados...</p>
            </div>
         ) : (
            <div className="animate-in slide-in-from-bottom-6 duration-700">

               {activeTab === 'operators' && (
                  <div className="space-y-8">
                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-12 bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm overflow-hidden">
                           <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                              <Trophy className="text-yellow-500" size={18} /> Ranking de Performance (Vendas + Agilidade)
                           </h4>
                           <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                 <thead>
                                    <tr className="border-b border-slate-100">
                                       <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Operador</th>
                                       <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-center">TMA</th>
                                       <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-center">GAP Transição</th>
                                       <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-center">Concluídos</th>
                                       <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-center">Pulos (%)</th>
                                       <th className="pb-6 text-[10px] font-black text-slate-900 uppercase tracking-widest px-4 text-right">Pontuação</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-50">
                                    {operatorMetrics.ranking.map((op, i) => (
                                       <tr key={op.id} className="group hover:bg-slate-50 transition-all">
                                          <td className="py-6 px-4">
                                             <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm">{op.name.charAt(0)}</div>
                                                <span className="font-black text-slate-800">{op.name}</span>
                                             </div>
                                          </td>
                                          <td className="py-6 px-4 text-center">
                                             <span className="font-black text-slate-600 flex items-center justify-center gap-1"><Clock size={12} className="text-blue-400" /> {formatTime(op.tma)}</span>
                                          </td>
                                          <td className="py-6 px-4 text-center">
                                             <div className="flex flex-col items-center">
                                                <span className={`font-black flex items-center gap-1 ${op.avgGap > 120 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                   <Timer size={12} /> {formatTime(op.avgGap)}
                                                </span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Pico: {formatTime(op.maxGap)}</span>
                                             </div>
                                          </td>
                                          <td className="py-6 px-4 text-center">
                                             <span className="bg-slate-100 text-slate-700 px-4 py-1.5 rounded-full text-[11px] font-black">{op.completed}</span>
                                          </td>
                                          <td className="py-6 px-4 text-center">
                                             <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${op.skipPercentage > 15 ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}>{op.skipPercentage}%</span>
                                          </td>
                                          <td className="py-6 px-4 text-right">
                                             <div className="flex items-center justify-end gap-2">
                                                {i === 0 && <Trophy size={16} className="text-yellow-500 animate-bounce" />}
                                                <span className="text-2xl font-black text-slate-900">{op.score}</span>
                                             </div>
                                          </td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                     <div className="lg:col-span-8 bg-white p-12 rounded-[64px] shadow-sm border border-slate-100">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-3 mb-12">
                           <TrendingUp className="text-blue-600" size={24} /> Saúde Operacional por Estágio (IDE)
                        </h4>
                        {stageStats.length > 0 ? (
                           <div className="h-[400px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <BarChart data={stageStats}>
                                    <XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                    <YAxis hide domain={[0, 100]} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} />
                                    <Bar dataKey="percentage" radius={[16, 16, 16, 16]} barSize={45}>
                                       {stageStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                    </Bar>
                                 </BarChart>
                              </ResponsiveContainer>
                           </div>
                        ) : (
                           <div className="h-[400px] flex items-center justify-center text-slate-300 font-black uppercase text-[10px] tracking-widest">Sem dados no período</div>
                        )}
                     </div>
                     <div className="lg:col-span-4 bg-slate-900 p-10 rounded-[56px] text-white shadow-2xl flex flex-col justify-between">
                        <div>
                           <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8">IPM - Indice de Performance Médio</h5>
                           <div className="space-y-6">
                              <div className="flex justify-between items-center"><span className="text-sm font-bold text-slate-400">Total Ligações</span><span className="text-xl font-black text-blue-400">{calls.length}</span></div>
                              <div className="flex justify-between items-center"><span className="text-sm font-bold text-slate-400">Média TMA</span><span className="text-xl font-black text-white">{formatTime(calls.length > 0 ? calls.reduce((a, b) => a + b.duration, 0) / calls.length : 0)}</span></div>
                              <div className="flex justify-between items-center"><span className="text-sm font-bold text-slate-400">Taxa de Pulos</span><span className="text-xl font-black text-red-500">{tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'skipped').length / tasks.length) * 100) : 0}%</span></div>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'deep_dive' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                     {deduplicatedAnalysis.map((q: any) => {
                        const baseQuestion = questions.find(base => base.id === q.id || base.text === q.text || base.order === q.order);
                        return (
                           <div key={q.id} className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm flex flex-col group hover:border-blue-200 transition-all">
                              <div className="flex justify-between items-start mb-6">
                                 <div className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">IP: {q.positivity}%</div>
                                 <span className="text-[10px] font-black text-slate-300">ORDEM {q.order}</span>
                              </div>
                              <h4 className="text-sm font-black text-slate-800 leading-tight mb-10 h-12 line-clamp-2">{q.text}</h4>
                              <div className="flex-1 space-y-6">
                                 {q.distribution.map((d: any, idx: number) => {
                                    const normalizeValue = (s: string) => s ? s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
                                    const normName = normalizeValue(d.name);
                                    const isExcellent = ['sim', 'otimo', 'atendeu', 'no prazo', 'boa', 'alto', 'quimicos', 'fotovoltaico', 'aquecedores'].includes(normName);
                                    const isBad = ['nao', 'ruim', 'precisa melhorar', 'com problema', 'baixo', 'não, cliente perdido'].includes(normName);
                                    const colorClass = isExcellent ? 'bg-emerald-500' : isBad ? 'bg-red-500' : 'bg-amber-500';
                                    const percentage = q.responsesCount > 0 ? (d.value / q.responsesCount) * 100 : 0;
                                    return (
                                       <div key={idx} className="space-y-2 group/item cursor-pointer" onClick={() => baseQuestion && openAuditGrid(baseQuestion, d.name)}>
                                          <div className="flex items-center justify-between">
                                             <span className="text-[11px] font-black text-slate-600 uppercase tracking-tight">{d.name}</span>
                                             <span className="text-[12px] font-black text-slate-900">{d.value}</span>
                                          </div>
                                          <div className="w-full h-3.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                             <div className={`h-full ${colorClass} transition-all duration-1000 shadow-sm`} style={{ width: `${percentage}%` }}></div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}

               {activeTab === 'protocols' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     <div className="bg-white p-12 rounded-[64px] border border-slate-100 shadow-sm">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2"><ClipboardList className="text-blue-500" size={18} /> Protocolos por Setor</h4>
                        <div className="h-80">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={detailedStats?.protocolCategoryStats} onClick={(d: any) => d?.activePayload?.[0] && openProtocolDrillDown(d.activePayload[0].payload.id, d.activePayload[0].payload.name)}>
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                 <Tooltip cursor={{ fill: '#f8fafc' }} />
                                 <Bar dataKey="value" fill="#2563eb" radius={[12, 12, 0, 0]} barSize={40} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>

                     <div className="bg-white p-12 rounded-[64px] border border-slate-100 shadow-sm">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2"><PhoneOff className="text-red-500" size={18} /> Motivos de Pulos (Skips)</h4>
                        <div className="h-80">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={detailedStats?.skipStats} onClick={(d: any) => d?.activePayload?.[0] && openSkipDrillDown(d.activePayload[0].payload.name)}>
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                 <Tooltip cursor={{ fill: '#f8fafc' }} />
                                 <Bar dataKey="value" fill="#ef4444" radius={[12, 12, 0, 0]} barSize={40} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'visits' && (
                  <div className="space-y-8">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-emerald-50 p-8 rounded-[32px] text-center border border-emerald-100">
                           <p className="text-[9px] font-black uppercase text-emerald-400 tracking-widest mb-1">Total de Visitas</p>
                           <p className="text-4xl font-black text-emerald-600">{visits.length}</p>
                        </div>
                        <div className="bg-blue-50 p-8 rounded-[32px] text-center border border-blue-100">
                           <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest mb-1">Agendadas</p>
                           <p className="text-4xl font-black text-blue-600">{visits.filter((v: any) => v.status === 'PENDING').length}</p>
                        </div>
                        <div className="bg-slate-900 p-8 rounded-[32px] text-center text-white">
                           <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Concluídas</p>
                           <p className="text-4xl font-black">{visits.filter((v: any) => v.status === 'COMPLETED').length}</p>
                        </div>
                     </div>

                     <div className="bg-white p-12 rounded-[64px] border border-slate-100 shadow-sm">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2"><MapPin className="text-blue-500" size={18} /> Visitas por Vendedor</h4>
                        <div className="h-80">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={Object.entries(visits.reduce((acc: any, v: any) => {
                                 const name = v.salespersonName || 'Desconhecido';
                                 acc[name] = (acc[name] || 0) + 1;
                                 return acc;
                              }, {})).map(([name, value]) => ({ name, value }))}>
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                 <Tooltip cursor={{ fill: '#f8fafc' }} />
                                 <Bar dataKey="value" fill="#10b981" radius={[12, 12, 0, 0]} barSize={40} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>
               )}
            </div>
         )}

         {/* DRILL DOWN MODAL (TABLE VIEW) */}
         {drillDownData.isOpen && (
            <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-8">
               <div className="bg-white w-full h-full max-w-[98vw] rounded-[48px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
                  <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
                     <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-xl shadow-2xl">ID</div>
                        <div>
                           <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter">Auditoria Dreon</h3>
                           <p className="text-blue-400 text-[10px] font-black uppercase mt-1 tracking-[0.2em]">{drillDownData.title} &bull; <span className="text-white">{drillDownData.filterLabel}</span></p>
                        </div>
                     </div>
                     <button onClick={() => setDrillDownData({ ...drillDownData, isOpen: false })} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
                  </div>

                  <div className="flex-1 overflow-auto bg-slate-50 custom-scrollbar">
                     {drillDownData.data.length > 0 ? (
                        <div className="p-4 md:p-8 min-w-max">
                           <table className="w-full text-left border-separate border-spacing-0 bg-white rounded-3xl shadow-sm border border-slate-200">
                              <thead>
                                 <tr className="bg-slate-50">
                                    <th className="sticky left-0 bg-slate-50 z-20 py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">Cliente</th>
                                    <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">Operador</th>
                                    <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">Tipo</th>
                                    <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">Data</th>
                                    {drillDownData.type === 'question' && questions
                                       .filter(q => !drillDownData.selectedCallType || q.type === drillDownData.selectedCallType || q.type === 'ALL')
                                       .map(q => (
                                          <th key={q.id} className="py-5 px-6 text-[10px] font-black uppercase text-blue-600 tracking-widest border-b border-slate-200 min-w-[200px] bg-blue-50/20">{q.text}</th>
                                       ))}
                                    {drillDownData.type === 'protocol' && <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">Status</th>}
                                    {drillDownData.type === 'skip' && <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">Motivo Pulo</th>}
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {drillDownData.data.map((item, idx) => (
                                    <tr
                                       key={idx}
                                       onClick={() => drillDownData.type === 'question' && setSelectedAuditCall(item)}
                                       className={`transition-colors group ${drillDownData.type === 'question' ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-slate-50'}`}
                                    >
                                       <td className="sticky left-0 bg-white group-hover:bg-inherit z-10 py-5 px-6 border-r border-slate-50">
                                          <p className="font-black text-slate-800 text-sm">{item.client?.name || item.clients?.name || 'Manual'}</p>
                                          <span className="text-[10px] font-bold text-blue-600">{item.client?.phone || item.clients?.phone}</span>
                                       </td>
                                       <td className="py-5 px-6">
                                          <span className="font-bold text-slate-600 text-xs">@{item.operator?.name || item.profiles?.username_display || item.operator?.username}</span>
                                       </td>
                                       <td className="py-5 px-6">
                                          <span className="px-2 py-1 bg-slate-100 rounded text-[9px] font-black uppercase text-slate-500">{item.type || 'CHAMADA'}</span>
                                       </td>
                                       <td className="py-5 px-6 text-[10px] font-bold text-slate-400 whitespace-nowrap">
                                          {new Date(item.startTime || item.openedAt || item.deadline).toLocaleString('pt-BR')}
                                       </td>
                                       {drillDownData.type === 'question' && questions
                                          .filter(q => !drillDownData.selectedCallType || q.type === drillDownData.selectedCallType || q.type === 'ALL')
                                          .map(q => {
                                             const ans = dataService.getResponseValue(item.responses, q);
                                             return (
                                                <td key={q.id} className="py-5 px-6 bg-slate-50/10 text-[9px] font-black uppercase text-slate-600">{ans || '-'}</td>
                                             );
                                          })}
                                       {drillDownData.type === 'protocol' && (
                                          <td className="py-5 px-6"><span className="bg-slate-900 text-white px-3 py-1 rounded-md text-[9px] font-black uppercase">{item.status}</span></td>
                                       )}
                                       {drillDownData.type === 'skip' && (
                                          <td className="py-5 px-6 font-bold text-red-500 italic text-xs">{item.skipReason}</td>
                                       )}
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                           <AlertCircle size={64} className="animate-pulse" />
                           <p className="font-black uppercase text-xs mt-6 tracking-[0.3em]">Nenhum registro encontrado.</p>
                        </div>
                     )}
                  </div>
                  <div className="p-8 bg-white border-t border-slate-100 flex justify-end">
                     <button onClick={() => setDrillDownData({ ...drillDownData, isOpen: false })} className="px-12 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-2xl active:scale-95 transition-all">Fechar Auditoria</button>
                  </div>
               </div>
            </div>
         )}

         {/* FICHA DE AUDITORIA COMPLETA */}
         {selectedAuditCall && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/90 backdrop-blur-2xl p-4 animate-in fade-in zoom-in duration-300">
               <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[56px] shadow-2xl flex flex-col overflow-hidden">
                  <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                     <div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter">Ficha de Atendimento Real</h3>
                        <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mt-1">
                           {selectedAuditCall.client?.name || selectedAuditCall.clients?.name} &bull; Operador: {selectedAuditCall.operator?.name || selectedAuditCall.profiles?.username_display}
                        </p>
                     </div>
                     <button onClick={() => setSelectedAuditCall(null)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                     <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                           <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={16} className="text-red-500" /> Detalhes do Cliente</h4>
                           <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                              <p className="text-lg font-black text-slate-800">{selectedAuditCall.client?.name || selectedAuditCall.clients?.name}</p>
                              <p className="text-sm font-bold text-blue-600 mt-1">{selectedAuditCall.client?.phone || selectedAuditCall.clients?.phone}</p>
                              <p className="text-xs text-slate-500 mt-4 leading-relaxed">{selectedAuditCall.client?.address || selectedAuditCall.clients?.address || 'Sem endereço'}</p>
                              <div className="flex flex-wrap gap-2 mt-4">
                                 {(selectedAuditCall.client?.items || selectedAuditCall.clients?.items || []).map((it: string) => (
                                    <span key={it} className="bg-white text-[9px] font-black uppercase px-3 py-1 rounded-lg border border-slate-200">{it}</span>
                                 ))}
                              </div>
                           </div>
                        </div>
                        <div className="space-y-4">
                           <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={16} className="text-indigo-500" /> Cronometria</h4>
                           <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col justify-center gap-6 h-[168px]">
                              <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início Chamada:</span>
                                 <span className="text-xs font-bold text-slate-800">{new Date(selectedAuditCall.startTime).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração Conversa:</span>
                                 <span className="text-lg font-black text-slate-900">{formatTime(selectedAuditCall.duration)}</span>
                              </div>
                           </div>
                        </div>
                     </section>

                     <section className="space-y-6">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                           <FileText className="text-blue-600" size={20} /> Relatório Escrito do Operador
                        </h4>
                        <div className="p-8 bg-blue-50/30 rounded-[32px] border border-blue-100 text-slate-800 font-bold italic whitespace-pre-wrap leading-relaxed shadow-sm">
                           {selectedAuditCall.responses?.written_report || "Nenhum relatório escrito registrado para esta chamada."}
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
                                    <span className="self-start px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase shadow-sm">
                                       {response}
                                    </span>
                                 </div>
                              );
                           })}
                        </div>
                     </section>
                  </div>

                  <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                     <button onClick={() => setSelectedAuditCall(null)} className="px-14 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-2xl active:scale-95 transition-all">Fechar Auditoria</button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

// Fixed export from Protocols to Reports
export default Reports;
