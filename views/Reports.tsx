
import React from 'react';
import {
   BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
   Cell, LineChart, Line, Legend, PieChart, Pie, AreaChart, Area
} from 'recharts';
import {
   X, Loader2, AlertCircle, TrendingUp, Target, Filter, PhoneOff, Zap,
   BarChart3, ClipboardList, Timer, Phone, Trophy, Clock, MapPin,
   Download, FileSpreadsheet, Send, MessageSquare, DollarSign, Users,
   Search, Calendar, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp,
   Smile, Meh, Frown, Tag
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { CallRecord, User, Client, Protocol, Question, Task, OperatorEvent, OperatorEventType, Visit, Sale, SaleStatus, WhatsAppTask, CallType, ClientTag } from '../types';
import PostSaleRemarketingReport from './PostSaleRemarketingReport';
import ProspectHistoryDrawer from '../components/ProspectHistoryDrawer';

// --- HELPER COMPONENTS ---

const MetricCard: React.FC<{
   title: string;
   value: string | number;
   subtitle?: string;
   icon: React.ElementType;
   trend?: { value: number; isUp: boolean };
   color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
   onClick?: () => void;
}> = ({ title, value, subtitle, icon: Icon, trend, color = 'slate', onClick }) => {
   const colorMap = {
      blue: 'bg-blue-50 text-blue-600 border-blue-100',
      emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      amber: 'bg-amber-50 text-amber-600 border-amber-100',
      rose: 'bg-rose-50 text-rose-600 border-rose-100',
      slate: 'bg-slate-50 text-slate-600 border-slate-100'
   };

   return (
      <div onClick={onClick} className={`p-6 rounded-[32px] border ${colorMap[color]} relative overflow-hidden group transition-all ${onClick ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1 active:scale-95' : 'hover:shadow-md'}`}>
         <div className="flex justify-between items-start mb-4">
            <div className={`p-3 bg-white rounded-2xl shadow-sm`}>
               <Icon size={20} className={color === 'slate' ? 'text-slate-900' : `text-${color}-500`} />
            </div>
            {trend && (
               <div className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full ${trend.isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {trend.isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(trend.value)}%
               </div>
            )}
         </div>
         <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{title}</p>
         <h3 className="text-3xl font-black tracking-tight">{value}</h3>
         {subtitle && <p className="text-xs font-bold mt-2 opacity-80">{subtitle}</p>}
      </div>
   );
};

// --- MAIN COMPONENT ---

const Reports: React.FC<{ user: any }> = ({ user }) => {
   const [isLoading, setIsLoading] = React.useState(true);
   const [activeTab, setActiveTab] = React.useState<'overview' | 'communications' | 'sales' | 'operators' | 'audit' | 'leads' | 'post_sale'>('overview');
   const [drawerProspectId, setDrawerProspectId] = React.useState<string | null>(null);

   // Custom Date Range
   const [dateRange, setDateRange] = React.useState({
      start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
   });

   // --- FILTER & MODAL STATE ---
   const [searchTerm, setSearchTerm] = React.useState('');
   const [filterOperator, setFilterOperator] = React.useState<string>('all');
   const [filterType, setFilterType] = React.useState<'all' | 'call' | 'whatsapp'>('all');
   const [selectedInteraction, setSelectedInteraction] = React.useState<any>(null);
   const [selectedGapAudit, setSelectedGapAudit] = React.useState<{ op: User, gaps: any[] } | null>(null);
   const [isSkipAuditModalOpen, setIsSkipAuditModalOpen] = React.useState(false);
   const [skipAuditData, setSkipAuditData] = React.useState<any[]>([]);

   // Data State
   const [calls, setCalls] = React.useState<CallRecord[]>([]);
   const [tasks, setTasks] = React.useState<Task[]>([]);
   const [whatsappTasks, setWhatsappTasks] = React.useState<WhatsAppTask[]>([]);
   const [sales, setSales] = React.useState<Sale[]>([]);
   const [operators, setOperators] = React.useState<User[]>([]);
   const [clients, setClients] = React.useState<Client[]>([]);

   const [events, setEvents] = React.useState<OperatorEvent[]>([]);
   const [questions, setQuestions] = React.useState<Question[]>([]);
   const [visits, setVisits] = React.useState<Visit[]>([]);
   const [prospects, setProspects] = React.useState<Client[]>([]);

   // Derived Metrics State
   const [metrics, setMetrics] = React.useState<any>({
      revenue: 0,
      conversionRate: 0,
      ticketAverage: 0,
      totalContacts: 0,
      totalSales: 0,
      npsScore: 0,
      npsPromoters: 0,
      npsDetractors: 0,
      npsTotal: 0,
      satisfactionRates: {
          price: { satisfied: 0, total: 0 },
          product: { satisfied: 0, total: 0 },
          speed: { satisfied: 0, total: 0 }
      },
      tagDistribution: []
   });

   const loadData = React.useCallback(async () => {
      setIsLoading(true);
      try {
         const [
            fetchedCalls,
            fetchedTasks,
            fetchedWa,
            fetchedSales,
            fetchedOps,
            fetchedClients,

            fetchedEvents,
            fetchedQuestions,
            fetchedVisits,
            fetchedProspects,
            fetchedTags,
            fetchedInvalid
         ] = await Promise.all([
            dataService.getCalls(dateRange.start, dateRange.end),
            dataService.getTasks(), // Tasks history is tricky, might need filter update in future
            dataService.getWhatsAppTasks(undefined, dateRange.start, dateRange.end),
            dataService.getSales(dateRange.start, dateRange.end),
            dataService.getUsers(),
            dataService.getClients(),

            dataService.getOperatorEvents(dateRange.start, dateRange.end),
            dataService.getQuestions(),
            dataService.getVisits(),
            dataService.getProspects(),
            dataService.getClientTags(),
            dataService.getInvalidClients()
         ]);

         setCalls(fetchedCalls);
         setTasks(fetchedTasks); // Note: filter by date if needed for history
         setWhatsappTasks(fetchedWa);
         setSales(fetchedSales);
         setOperators(fetchedOps);
         setClients(fetchedClients);
         setOperators(fetchedOps);
         setClients(fetchedClients);
         setEvents(fetchedEvents);
         setQuestions(fetchedQuestions);
         setVisits(fetchedVisits);
         setProspects(fetchedProspects);
         setInvalidClients(fetchedInvalid);

         // --- CALCULATE BASE METRICS ---
         // Revenue now counts ALL sales except CANCELADA
         const validSales = fetchedSales.filter(s => s.status !== ('CANCELADA' as any));
         const totalRevenue = validSales.reduce((acc, s) => acc + (s.value || 0), 0);
         const totalSalesCount = validSales.length;

         const uniqueContacts = new Set([
            ...fetchedCalls.map(c => c.clientId),
            ...fetchedWa.filter(w => w.status === 'completed').map(w => w.clientId)
         ]).size;

         // Use OperatorEvents for accurate timing of skips today
         const skippedEvents = fetchedEvents.filter(e => e.eventType === OperatorEventType.PULAR_ATENDIMENTO);

         const completedTaskIds = new Set([
            ...fetchedCalls.map(c => c.taskId),
            ...fetchedWa.filter(w => w.status === 'completed').map(w => w.sourceId || w.id) 
         ]);
         
         let pureSkipCount = 0;
         const skipAuditDetails: any[] = [];
         const processedSkipTaskIds = new Set<string>();

         skippedEvents.forEach(evt => {
            if (evt.taskId && !completedTaskIds.has(evt.taskId) && !processedSkipTaskIds.has(evt.taskId)) {
               processedSkipTaskIds.add(evt.taskId);
               
               // Look up task details
               const task = fetchedTasks.find(t => t.id === evt.taskId);
               const waTask = fetchedWa.find(w => w.id === evt.taskId || w.sourceId === evt.taskId);
               
               if (task || waTask) {
                   pureSkipCount++;
                    const assignedTo = task ? task.assignedTo : (waTask as any)?.assignedTo;
                    const clientId = task ? task.clientId : waTask?.clientId;
                    const clientName = task ? (task.clientName || task.clients?.name) : waTask?.clientName;
                    const note = evt.note || (task ? task.skipReason : (waTask as any)?.skipNote) || 'Sem motivo informado';
                   const op = fetchedOps.find(o => o.id === assignedTo);

                   skipAuditDetails.push({
                       id: evt.id,
                       operatorId: assignedTo,
                       operatorName: op?.name || 'Desconhecido',
                       clientId: clientId,
                       clientName: clientName || 'Desconhecido',
                       timestamp: evt.timestamp,
                       note: note
                   });
               }
            }
         });

         // Also count any WhatsApp specific skip events if they weren't caught by PULAR_ATENDIMENTO
         const waSkipEvents = fetchedEvents.filter(e => e.eventType === OperatorEventType.WHATSAPP_SKIP);
         waSkipEvents.forEach(evt => {
             if (evt.taskId && !completedTaskIds.has(evt.taskId) && !processedSkipTaskIds.has(evt.taskId)) {
                 processedSkipTaskIds.add(evt.taskId);
                 const waTask = fetchedWa.find(w => w.id === evt.taskId || w.sourceId === evt.taskId);
                 if (waTask) {
                     pureSkipCount++;
                      const op = fetchedOps.find(o => o.id === (waTask as any).assignedTo);
                      skipAuditDetails.push({
                          id: evt.id,
                          operatorId: (waTask as any).assignedTo,
                          operatorName: op?.name || 'Desconhecido',
                          clientId: waTask.clientId,
                          clientName: waTask.clientName || 'Desconhecido',
                          timestamp: evt.timestamp,
                          note: evt.note || (waTask as any).skipNote || 'Sem motivo informado'
                      });
                 }
             }
         });

         setSkipAuditData(skipAuditDetails.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

         const totalInteractions = fetchedCalls.length + fetchedWa.filter(w => w.status === 'completed').length + pureSkipCount;

         // --- CALCULATE SATISFACTION METRICS ---
         let promoters = 0;
         let detractors = 0;
         let npsTotal = 0;
         
         const satRates = {
             price: { satisfied: 0, total: 0 },
             product: { satisfied: 0, total: 0 },
             speed: { satisfied: 0, total: 0 }
         };

         // Analyze all responses from calls and WA tasks within date range
         const allInteractions = [
             ...fetchedCalls,
             ...fetchedWa.filter(w => w.status === 'completed')
         ];

         allInteractions.forEach((interaction: any) => {
             const responses = interaction.responses || {};
             
             // NPS Eval
             const npsRaw = responses['q_nps'];
             if (npsRaw !== undefined) {
                 const npsScoreRaw = parseInt(npsRaw, 10);
                 if (!isNaN(npsScoreRaw)) {
                     npsTotal++;
                     if (npsScoreRaw >= 9) promoters++;
                     else if (npsScoreRaw <= 6) detractors++;
                 }
             }

             // Specific Satisfaction Eval
             const checkSatisfaction = (key: string, category: keyof typeof satRates) => {
                 const val = responses[key];
                 if (val) {
                     satRates[category].total++;
                     // Assumes responses like 'Ótimo', 'Sim', etc. are positive
                     if (['Ótimo', 'Bom', 'Sim', 'Adequado'].includes(String(val))) {
                         satRates[category].satisfied++;
                     }
                 }
             };

             checkSatisfaction('q_precificacao', 'price');
             checkSatisfaction('q_produto_estoque', 'product');
             checkSatisfaction('q_velocidade', 'speed');
         });

         const npsScore = npsTotal > 0 ? Math.round(((promoters - detractors) / npsTotal) * 100) : 0;

         // --- CALCULATE TAG DISTRIBUTION ---
         const tagCounts: { [key: string]: number } = {};
         fetchedTags.filter(t => t.status === 'APROVADA_SUPERVISOR' || t.status === 'SUGERIDA' || t.status === 'CONFIRMADA_OPERADOR').forEach(t => {
             // Only include tags that might have been applied in this period (or all active if preferrable)
             tagCounts[t.categoria] = (tagCounts[t.categoria] || 0) + 1;
         });
         
         const tagDistribution = Object.entries(tagCounts)
            .sort((a,b) => b[1] - a[1])
            .map(([name, value]) => ({ name, value }));

         setMetrics({
            revenue: totalRevenue,
            conversionRate: uniqueContacts > 0 ? (totalSalesCount / uniqueContacts) * 100 : 0,
            ticketAverage: totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0,
            totalContacts: totalInteractions,
            totalSales: totalSalesCount,
            pureSkips: pureSkipCount, // Store to display in subtitle
            npsScore,
            npsPromoters: promoters,
            npsDetractors: detractors,
            npsTotal,
            satisfactionRates: satRates,
            tagDistribution
         });

      } catch (e) {
         console.error("Failed to load reports data", e);
      } finally {
         setIsLoading(false);
      }
   }, [dateRange]);

   React.useEffect(() => { loadData(); }, [loadData]);

   // --- EXPORT FUNCTION ---
   const handleExport = (type: 'csv' | 'xls') => {
      // Basic CSV implementation for current audit view or filtered data
      // For simplicity, exporting CALLS + SALES joined or separate
      const headers = ["DATA", "TIPO", "OPERADOR", "CLIENTE", "STATUS", "VALOR/DURACAO", "OBS"];

      // Combine calls and sells for export
      const rows = [
         ...calls.map(c => [
            new Date(c.startTime).toLocaleDateString(),
            'LIGACAO',
            operators.find(u => u.id === c.operatorId)?.name || 'N/A',
            clients.find(cl => cl.id === c.clientId)?.name || 'N/A',
            'CONCLUIDA',
            c.duration + 's',
            JSON.stringify(c.responses)
         ]),
         ...sales.map(s => [
            new Date(s.registeredAt).toLocaleDateString(),
            'VENDA',
            operators.find(u => u.id === s.operatorId)?.name || 'N/A',
            s.clientName,
            s.status,
            s.value,
            s.category
         ])
      ];

      const csvContent = "\uFEFF" + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio_dreon_${dateRange.start}_${dateRange.end}.csv`;
      link.click();
   };

   // --- FILTERED AUDIT DATA ---
   const getFilteredAuditData = () => {
      let data = [
         ...calls.map(c => ({ ...c, _type: 'call', date: c.startTime })),
         ...whatsappTasks.map(w => ({ ...w, _type: 'whatsapp', date: w.createdAt }))
      ];

      if (filterType !== 'all') {
         data = data.filter(d => d._type === filterType);
      }

      if (filterOperator !== 'all') {
         data = data.filter(d => (d._type === 'call' ? (d as any).operatorId : (d as any).assignedTo) === filterOperator);
      }

      if (searchTerm) {
         const lower = searchTerm.toLowerCase();
         data = data.filter(d => {
            const client = clients.find(c => c.id === d.clientId) || prospects.find(p => p.id === d.clientId);
            const clientName = client?.name || (d as any).clientName || '';
            const clientPhone = client?.phone || (d as any).clientPhone || '';
            return clientName.toLowerCase().includes(lower) || clientPhone.includes(lower);
         });
      }

      return data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
   };

   // --- MODAL RENDERER ---
   const renderInteractionDetails = () => {
      if (!selectedInteraction) return null;

      const isCall = selectedInteraction._type === 'call';
      const isWhatsApp = selectedInteraction.type === CallType.WHATSAPP || selectedInteraction._type === 'whatsapp';
      const client = clients.find(c => c.id === selectedInteraction.clientId) || prospects.find(p => p.id === selectedInteraction.clientId);
      const op = operators.find(o => o.id === (isCall ? selectedInteraction.operatorId : selectedInteraction.assignedTo));
      const date = new Date(selectedInteraction.date);

      // Find related sale (registered equal or after interaction date)
      const relatedSale = sales.find(s => {
         if (s.clientId !== selectedInteraction.clientId) return false;
         return new Date(s.registeredAt) >= new Date(isCall ? selectedInteraction.startTime : selectedInteraction.createdAt);
      });

      // Find related visit (registered equal or after interaction date)
      const relatedVisit = visits.find(v => {
         if (v.clientId !== selectedInteraction.clientId) return false;
         return new Date((v as any).scheduledDate || v.createdAt) >= new Date(isCall ? (selectedInteraction as any).startTime : (selectedInteraction as any).createdAt);
      });

      return (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedInteraction(null)}>
            <div className="bg-white rounded-[32px] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

               {/* Header */}
               <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                  <div>
                     <div className="flex items-center gap-3 mb-2">
                        <div className={`p-3 rounded-2xl ${isCall ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                           {isCall ? <Phone size={24} /> : <MessageSquare size={24} />}
                        </div>
                        <div>
                           <h3 className="text-xl font-black text-slate-800 tracking-tight">Detalhes da Interação</h3>
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ID: {selectedInteraction.id.slice(0, 8)}</p>
                        </div>
                     </div>
                  </div>
                  <button onClick={() => setSelectedInteraction(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                     <X size={24} className="text-slate-400" />
                  </button>
               </div>

               <div className="p-8 space-y-8">
                  {/* Tempo e Operador */}
                  <div className="flex flex-wrap gap-4">
                     <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 rounded-full">
                        <Clock size={16} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600 uppercase">{date.toLocaleString()}</span>
                     </div>
                     <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 rounded-full">
                        <Users size={16} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600 uppercase">{op?.name || 'Operador Desconhecido'}</span>
                     </div>
                  </div>

                  {/* Cliente Card */}
                  <div className="bg-gradient-to-br from-slate-50 to-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Users size={120} />
                     </div>
                     <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Cliente</h4>
                     <div className="relative z-10">
                        <p className="text-2xl font-black text-slate-800 mb-1">{client?.name || selectedInteraction.clientName || 'Cliente Indefinido'}</p>
                        <p className="text-lg font-medium text-slate-500">{client?.phone || selectedInteraction.clientPhone || 'Sem telefone'}</p>
                     </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 flex flex-col justify-center items-center text-center">
                        <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-2">Duração</h4>
                        <p className="text-3xl font-black text-blue-600">{isCall ? selectedInteraction.duration + 's' : '-'}</p>
                     </div>

                     <div className={`p-6 rounded-3xl border flex flex-col justify-center items-center text-center ${relatedSale ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${relatedSale ? 'text-emerald-500' : 'text-slate-400'}`}>Venda Gerada?</h4>
                        <p className={`text-xl font-black ${relatedSale ? 'text-emerald-600' : 'text-slate-400'}`}>
                           {relatedSale ? 'SIM' : 'NÃO'}
                        </p>
                        {relatedSale && <p className="text-sm text-emerald-600 font-bold mt-1 bg-emerald-100 px-3 py-1 rounded-full">{relatedSale.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
                     </div>

                     <div className={`p-6 rounded-3xl border flex flex-col justify-center items-center text-center ${relatedVisit ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${relatedVisit ? 'text-amber-500' : 'text-slate-400'}`}>Visita Gerada?</h4>
                        <p className={`text-xl font-black ${relatedVisit ? 'text-amber-600' : 'text-slate-400'}`}>
                           {relatedVisit ? 'SIM' : 'NÃO'}
                        </p>
                         {relatedVisit && <p className="text-xs text-amber-600 font-bold mt-1 uppercase">{new Date(relatedVisit.scheduledDate).toLocaleDateString()}</p>}
                     </div>
                  </div>

                  {/* Content / Responses */}
                  <div>
                     <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-6 flex items-center gap-2">
                        {isCall ? <ClipboardList size={16} /> : <MessageSquare size={16} />}
                        {isCall ? 'Questionário & Respostas' : 'Histórico da Mensagem'}
                     </h4>

                     {isCall ? (
                        <div className="grid grid-cols-1 gap-4">
                           {Object.entries(selectedInteraction.responses || {}).map(([key, val]: any) => {
                              // Find question text
                              const question = questions.find(q => q.id === key);
                              const label = question ? question.text : key;

                              return (
                                 <div key={key} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-2 leading-relaxed">{label}</p>
                                    <p className="text-base font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100">{String(val)}</p>
                                 </div>
                              );
                           })}
                           {Object.keys(selectedInteraction.responses || {}).length === 0 && (
                              <div className="text-center p-8 bg-slate-50 rounded-3xl border border-slate-100 border-dashed">
                                 <p className="text-sm text-slate-400 font-bold italic">Nenhuma resposta registrada para esta chamada.</p>
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                           <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                              <span className="text-sm font-bold text-slate-500">Status da Mensagem</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${selectedInteraction.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                 {selectedInteraction.status}
                              </span>
                           </div>
                           {selectedInteraction.skipReason && (
                              <div className="flex justify-between items-center text-red-500 bg-red-50 p-4 rounded-2xl">
                                 <span className="text-sm font-bold">Motivo do Pulo</span>
                                 <span className="text-sm font-black uppercase">{selectedInteraction.skipReason}</span>
                              </div>
                           )}
                           {selectedInteraction.whatsappNote && (
                              <div className="pt-2">
                                 <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Observação</span>
                                 <p className="mt-2 text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200">{selectedInteraction.whatsappNote}</p>
                              </div>
                           )}
                        </div>
                     )}
                  </div>
               </div>
            </div>
         </div>
      );
   };

   // --- GAP AUDIT MODAL ---
   const renderGapAuditModal = () => {
      if (!selectedGapAudit) return null;

      const { op, gaps } = selectedGapAudit;
      const longPauses = gaps.filter(g => g.duration >= 3600);

      return (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedGapAudit(null)}>
            <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
               
               <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50/80 backdrop-blur-sm">
                  <div>
                     <h3 className="text-xl font-black text-slate-800 tracking-tight">Auditoria de Gaps: {op.name}</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Timeline de Inatividade entre Atendimentos</p>
                  </div>
                  <button onClick={() => setSelectedGapAudit(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                     <X size={24} className="text-slate-400" />
                  </button>
               </div>

               <div className="p-8 overflow-y-auto flex-1 space-y-4">
                  {gaps.length === 0 ? (
                     <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-sm font-bold text-slate-400 italic">Nenhum intervalo capturado para este período.</p>
                     </div>
                  ) : (
                     <div className="space-y-3">
                        {gaps.map((gap, idx) => (
                           <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between transition-all hover:shadow-sm ${gap.duration >= 3600 ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100'}`}>
                              <div className="flex items-center gap-4">
                                 <div className={`p-2 rounded-xl ${gap.duration >= 3600 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                                    <Clock size={16} />
                                 </div>
                                 <div>
                                    <div className="flex items-center gap-2">
                                       <span className="text-xs font-black text-slate-700">{new Date(gap.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                       <span className="text-[10px] font-black text-slate-300">➜</span>
                                       <span className="text-xs font-black text-slate-700">{new Date(gap.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                                       {gap.duration >= 3600 ? 'Pausa Longa Determinada' : 'Intervalo entre atendimentos'}
                                    </p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <span className={`text-sm font-black ${gap.duration >= 3600 ? 'text-rose-600' : 'text-slate-700'}`}>
                                    {gap.duration >= 3600 
                                       ? `${Math.floor(gap.duration / 3600)}h ${Math.floor((gap.duration % 3600) / 60)}m` 
                                       : `${Math.floor(gap.duration / 60)}m ${Math.round(gap.duration % 60)}s`}
                                 </span>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>

               <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                  <div className="flex gap-4">
                     <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Gaps</span>
                        <span className="text-sm font-black text-slate-700">{gaps.length}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pausas &gt;1h</span>
                        <span className="text-sm font-black text-rose-600">{longPauses.length}</span>
                     </div>
                  </div>
                  <button onClick={() => setSelectedGapAudit(null)} className="px-6 py-2 bg-slate-900 text-white text-xs font-black uppercase rounded-xl hover:bg-slate-800 transition-colors">
                     Fechar
                  </button>
               </div>
            </div>
         </div>
      );
   };

   // --- HELPER CALCULATIONS ---
   const getMedian = (values: number[]) => {
      if (values.length === 0) return 0;
      values.sort((a, b) => a - b);
      const half = Math.floor(values.length / 2);
      if (values.length % 2) return values[half];
      return (values[half - 1] + values[half]) / 2.0;
   };

   return (
      <div className="space-y-8 pb-20 animate-in fade-in duration-500">
         {/* HEADER & FILTERS */}
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 rounded-[40px] shadow-sm border border-slate-100">
            <div>
               <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Painel de Inteligência</h2>
               <p className="text-slate-500 font-bold text-xs mt-1 uppercase tracking-widest">
                  {new Date(dateRange.start).toLocaleDateString()} ATÉ {new Date(dateRange.end).toLocaleDateString()}
               </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
               <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                  <Calendar size={16} className="text-slate-400 ml-2" />
                  <input
                     type="date"
                     value={dateRange.start}
                     onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                     className="bg-transparent text-xs font-black uppercase text-slate-700 outline-none w-28"
                  />
                  <span className="text-slate-300 font-black">/</span>
                  <input
                     type="date"
                     value={dateRange.end}
                     onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                     className="bg-transparent text-xs font-black uppercase text-slate-700 outline-none w-28"
                  />
               </div>

               <button onClick={() => handleExport('csv')} className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-colors">
                  <Download size={20} />
               </button>
            </div>
         </div>

         {/* TABS */}
         <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2">
            {[
               { id: 'overview', label: 'Visão Geral', icon: Target },
               { id: 'communications', label: 'Comunicações', icon: MessageSquare },
               { id: 'sales', label: 'Vendas & Receita', icon: DollarSign },
               { id: 'operators', label: 'Produtividade', icon: Users },
               { id: 'leads', label: 'Leads (Prospecção)', icon: Target },
               { id: 'post_sale', label: 'Pós-Venda & Remarketing', icon: Timer },
               { id: 'invalid_phones', label: 'Telefones Inválidos', icon: Search },
               { id: 'audit', label: 'Auditoria', icon: ClipboardList },
            ].map(tab => (
               <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-4 rounded-3xl text-sm font-black uppercase tracking-wide transition-all flex items-center gap-3 whitespace-nowrap border ${activeTab === tab.id
                     ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200'
                     : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'
                     }`}
               >
                  <tab.icon size={18} /> {tab.label}
               </button>
            ))}
         </div>

         {isLoading ? (
            <div className="h-96 flex flex-col items-center justify-center text-slate-400">
               <Loader2 className="animate-spin mb-4" size={48} />
               <p className="font-black uppercase tracking-widest text-xs">Processando dados...</p>
            </div>
         ) : (
            <div className="space-y-8">

               {/* OVERVIEW TAB */}
               {activeTab === 'overview' && (
                  <div className="space-y-8">
                     {/* VOLUME DE BASE KPIs */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <MetricCard
                           title="Base Total (Contatos)"
                           value={clients.length + prospects.length}
                           icon={Users} color="slate"
                        />
                        <MetricCard
                           title="Carteira de Clientes (Pós-Venda)"
                           value={clients.length}
                           icon={Target} color="emerald"
                           subtitle="Isolado para Remarketing e Pós-venda"
                        />
                        <MetricCard
                           title="Prospecção Fria (CRM Leads)"
                           value={prospects.length}
                           icon={Filter} color="blue"
                           subtitle="Aguardando qualificação / vendas"
                        />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <MetricCard
                           title="Receita Total"
                           value={metrics.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                           icon={DollarSign} color="emerald"
                           trend={{ value: 12, isUp: true }}
                        />
                        <MetricCard
                           title="Vendas Realizadas"
                           value={metrics.totalSales}
                           icon={Trophy} color="blue"
                        />
                        <MetricCard
                           title="Taxa de Conversão"
                           value={`${metrics.conversionRate.toFixed(1)}%`}
                           icon={TrendingUp} color="amber"
                           subtitle="Vendas sobre Contatos Totais"
                        />
                        <MetricCard
                           title="Contatos Totais"
                           value={metrics.totalContacts}
                           icon={Phone} color="slate"
                           subtitle={`Inclui ${metrics.pureSkips || 0} pulos diretos (Ver)`}
                           onClick={() => setIsSkipAuditModalOpen(true)}
                        />
                     </div>

                     {/* SATISFACTION (NPS) & TAGS SECTION */}
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* NPS CARD */}
                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex flex-col justify-between">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Net Promoter Score (NPS)</h4>
                           
                           <div className="flex items-center justify-center py-6">
                              <div className="relative">
                                 <svg className="w-32 h-32 transform -rotate-90">
                                    <circle cx="64" cy="64" r="56" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                                    <circle 
                                       cx="64" cy="64" r="56" fill="transparent" 
                                       stroke={metrics.npsScore > 50 ? '#10b981' : metrics.npsScore > 0 ? '#f59e0b' : '#ef4444'} 
                                       strokeWidth="12" 
                                       strokeDasharray={2 * Math.PI * 56} 
                                       strokeDashoffset={Math.max(0, (2 * Math.PI * 56) * (1 - (Math.max(0, metrics.npsScore) / 100)))} 
                                       strokeLinecap="round" 
                                    />
                                 </svg>
                                 <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                                    <span className="text-3xl font-black text-slate-800">{metrics.npsScore}</span>
                                 </div>
                              </div>
                           </div>
                           
                           <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                              <div className="text-center">
                                 <p className="text-[10px] font-black uppercase text-emerald-500 mb-1 flex justify-center gap-1"><Smile size={12}/> Promotores</p>
                                 <p className="text-sm font-black text-slate-800">{metrics.npsTotal > 0 ? Math.round((metrics.npsPromoters/metrics.npsTotal)*100) : 0}%</p>
                              </div>
                              <div className="h-6 w-px bg-slate-200" />
                              <div className="text-center">
                                 <p className="text-[10px] font-black uppercase text-amber-500 mb-1 flex justify-center gap-1"><Meh size={12}/> Neutros</p>
                                 <p className="text-sm font-black text-slate-800">{metrics.npsTotal > 0 ? Math.round(((metrics.npsTotal - metrics.npsPromoters - metrics.npsDetractors)/metrics.npsTotal)*100) : 0}%</p>
                              </div>
                              <div className="h-6 w-px bg-slate-200" />
                              <div className="text-center">
                                 <p className="text-[10px] font-black uppercase text-rose-500 mb-1 flex justify-center gap-1"><Frown size={12}/> Detratores</p>
                                 <p className="text-sm font-black text-slate-800">{metrics.npsTotal > 0 ? Math.round((metrics.npsDetractors/metrics.npsTotal)*100) : 0}%</p>
                              </div>
                           </div>
                           <p className="text-[9px] font-bold text-slate-400 text-center mt-4">Base: {metrics.npsTotal} avaliações</p>
                        </div>

                        {/* SPECIFIC SATISFACTION */}
                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex flex-col justify-center">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Satisfação por Área</h4>
                           <div className="space-y-6">
                              
                              {/* Price */}
                              <div>
                                 <div className="flex justify-between text-xs font-bold mb-2">
                                    <span className="text-slate-600 uppercase">Preço / Condições</span>
                                    <span className="text-blue-600 font-black">
                                      {metrics.satisfactionRates?.price?.total > 0 ? Math.round((metrics.satisfactionRates.price.satisfied / metrics.satisfactionRates.price.total) * 100) : 0}% Positivo
                                    </span>
                                 </div>
                                 <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${metrics.satisfactionRates?.price?.total > 0 ? (metrics.satisfactionRates.price.satisfied / metrics.satisfactionRates.price.total) * 100 : 0}%` }} />
                                 </div>
                                 <p className="text-[9px] text-right font-bold text-slate-400 mt-1">{metrics.satisfactionRates?.price?.total || 0} respostas</p>
                              </div>

                              {/* Product / Stock */}
                              <div>
                                 <div className="flex justify-between text-xs font-bold mb-2">
                                    <span className="text-slate-600 uppercase">Produto / Estoque</span>
                                    <span className="text-emerald-600 font-black">
                                       {metrics.satisfactionRates?.product?.total > 0 ? Math.round((metrics.satisfactionRates.product.satisfied / metrics.satisfactionRates.product.total) * 100) : 0}% Positivo
                                    </span>
                                 </div>
                                 <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${metrics.satisfactionRates?.product?.total > 0 ? (metrics.satisfactionRates.product.satisfied / metrics.satisfactionRates.product.total) * 100 : 0}%` }} />
                                 </div>
                                 <p className="text-[9px] text-right font-bold text-slate-400 mt-1">{metrics.satisfactionRates?.product?.total || 0} respostas</p>
                              </div>

                              {/* Speed */}
                              <div>
                                 <div className="flex justify-between text-xs font-bold mb-2">
                                    <span className="text-slate-600 uppercase">Velocidade de Retorno</span>
                                    <span className="text-amber-600 font-black">
                                       {metrics.satisfactionRates?.speed?.total > 0 ? Math.round((metrics.satisfactionRates.speed.satisfied / metrics.satisfactionRates.speed.total) * 100) : 0}% Positivo
                                    </span>
                                 </div>
                                 <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${metrics.satisfactionRates?.speed?.total > 0 ? (metrics.satisfactionRates.speed.satisfied / metrics.satisfactionRates.speed.total) * 100 : 0}%` }} />
                                 </div>
                                 <p className="text-[9px] text-right font-bold text-slate-400 mt-1">{metrics.satisfactionRates?.speed?.total || 0} respostas</p>
                              </div>
                           </div>
                        </div>

                        {/* TAG DISTRIBUTION */}
                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex flex-col justify-between">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center justify-between">
                                 Distribuição de Tags (IA)
                                 <Tag size={16} className="text-indigo-400" />
                            </h4>
                            <div className="h-[200px] flex-1">
                                {metrics.tagDistribution?.length > 0 ? (
                                   <ResponsiveContainer width="100%" height="100%">
                                       <PieChart>
                                           <Pie
                                               data={metrics.tagDistribution}
                                               innerRadius={50}
                                               outerRadius={80}
                                               paddingAngle={2}
                                               dataKey="value"
                                           >
                                               {metrics.tagDistribution.map((entry: any, index: number) => {
                                                   // Map tag names to specific colors based on constants definition if desired
                                                   const colors: Record<string, string> = {
                                                       'RECUPERACAO': '#ef4444', 
                                                       'OPORTUNIDADE': '#f59e0b', 
                                                       'REATIVACAO': '#8b5cf6',
                                                       'CONFIRMACAO': '#3b82f6',
                                                       'CLIENTE_PERDIDO': '#64748b'
                                                   };
                                                   return <Cell key={`cell-${index}`} fill={colors[entry.name] || '#94a3b8'} />;
                                               })}
                                           </Pie>
                                           <Tooltip />
                                       </PieChart>
                                   </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-300 font-bold text-xs uppercase tracking-widest">
                                        Sem Tags
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 space-y-2">
                                {metrics.tagDistribution?.slice(0,3).map((tag: any) => (
                                    <div key={tag.name} className="flex justify-between text-xs font-bold items-center">
                                        <span className="text-slate-600 truncate mr-2">{tag.name}</span>
                                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md shrink-0">{tag.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Evolução de Atendimentos</h4>
                           <div className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={Object.entries(calls.reduce((acc: any, call) => {
                                    const day = new Date(call.startTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                                    acc[day] = (acc[day] || 0) + 1;
                                    return acc;
                                 }, {})).map(([date, count]) => ({ date, count }))}>
                                    <defs>
                                       <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                       </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCalls)" />
                                 </AreaChart>
                              </ResponsiveContainer>
                           </div>
                        </div>

                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex flex-col">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Mix de Canais</h4>
                           <div className="flex-1 flex items-center justify-center">
                              <PieChart width={200} height={200}>
                                 <Pie
                                    data={[
                                       { name: 'Ligações', value: calls.filter(c => c.type !== CallType.WHATSAPP).length },
                                       { name: 'WhatsApp', value: whatsappTasks.filter(w => w.status === 'completed').length + calls.filter(c => c.type === CallType.WHATSAPP).length }
                                    ]}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                 >
                                    <Cell key="cell-0" fill="#3b82f6" />
                                    <Cell key="cell-1" fill="#10b981" />
                                 </Pie>
                                 <Tooltip />
                              </PieChart>
                           </div>
                           <div className="flex justify-center gap-6 mt-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                 <div className="w-3 h-3 rounded-full bg-blue-500" /> Ligações
                              </div>
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                 <div className="w-3 h-3 rounded-full bg-emerald-500" /> WhatsApp
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {/* COMMUNICATIONS TAB */}
               {activeTab === 'communications' && (
                  <div className="space-y-8">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <MetricCard title="Total Ligações" value={calls.filter(c => c.type !== CallType.WHATSAPP).length} icon={Phone} color="blue" />
                        <MetricCard
                           title="WhatsApp Ativos"
                           value={whatsappTasks.filter(w => w.status === 'completed').length + calls.filter(c => c.type === CallType.WHATSAPP).length}
                           icon={MessageSquare} color="emerald"
                        />
                        <MetricCard
                           title="Pulos / Sem Contato"
                           value={
                              events.filter(e => e.eventType === OperatorEventType.PULAR_ATENDIMENTO).length +
                              whatsappTasks.filter(w => w.status === 'skipped').length
                           }
                           icon={PhoneOff} color="rose"
                        />
                     </div>

                     <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Detalhamento por Status</h4>
                        <div className="h-[400px]">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={[
                                 { name: 'Atendido', value: calls.filter(c => c.type !== CallType.WHATSAPP).length, fill: '#3b82f6' },
                                 {
                                    name: 'Sem Resposta (Pulo)',
                                    value: events.filter(e => e.eventType === OperatorEventType.PULAR_ATENDIMENTO && (!e.note || !e.note.toLowerCase().includes('inválido'))).length,
                                    fill: '#f59e0b'
                                 },
                                 {
                                    name: 'Número Inválido',
                                    value: events.filter(e => e.eventType === OperatorEventType.PULAR_ATENDIMENTO && e.note?.toLowerCase().includes('inválido')).length,
                                    fill: '#ef4444'
                                 },
                                 { name: 'WhatsApp Entregue', value: whatsappTasks.filter(w => w.status === 'completed').length + calls.filter(c => c.type === CallType.WHATSAPP).length, fill: '#10b981' },
                              ]}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
                                 <YAxis axisLine={false} tickLine={false} />
                                 <Tooltip cursor={{ fill: '#f8fafc' }} />
                                 <Bar dataKey="value" radius={[8, 8, 8, 8]} barSize={60} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>
               )}

               {/* SALES TAB */}
               {activeTab === 'sales' && (
                  <div className="space-y-8">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Ranking de Vendedores</h4>
                           <div className="space-y-4">
                              {Object.entries(sales.reduce((acc: any, sale) => {
                                 const name = sale.externalSalesperson || operators.find(o => o.id === sale.operatorId)?.name || 'N/A';
                                 if (sale.status === SaleStatus.ENTREGUE) {
                                    acc[name] = (acc[name] || 0) + (sale.value || 0);
                                 }
                                 return acc;
                              }, {})).sort(([, a]: any, [, b]: any) => b - a).map(([name, val]: any, i) => (
                                 <div key={name} className="flex items-center gap-4 p-4 border border-slate-50 rounded-2xl hover:bg-slate-50 transition-colors">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>
                                       {i + 1}
                                    </div>
                                    <div className="flex-1">
                                       <p className="font-black text-slate-800 text-sm">{name}</p>
                                       <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(val / metrics.revenue) * 100}%` }} />
                                       </div>
                                    </div>
                                    <p className="font-black text-emerald-600 text-sm">
                                       {val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                 </div>
                              ))}
                           </div>
                        </div>

                        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Vendas por Categoria</h4>
                           <div className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <PieChart>
                                    <Pie
                                       data={Object.entries(sales.reduce((acc: any, sale) => {
                                          if (sale.status === SaleStatus.ENTREGUE) {
                                             acc[sale.category] = (acc[sale.category] || 0) + 1;
                                          }
                                          return acc;
                                       }, {})).map(([name, value]) => ({ name, value }))}
                                       innerRadius={80}
                                       outerRadius={120}
                                       paddingAngle={2}
                                       dataKey="value"
                                    >
                                       {Object.keys(sales).map((_, index) => (
                                          <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                                       ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                 </PieChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {/* OPERATORS TAB */}
               {activeTab === 'operators' && (
                  <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm overflow-hidden">
                     <table className="w-full text-left">
                        <thead className="border-b border-slate-100">
                           <tr>
                              <th className="pb-6 pl-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Operador</th>
                              <th className="pb-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Ligações</th>
                              <th className="pb-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">WhatsApp</th>
                              <th className="pb-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Vendas</th>
                              <th className="pb-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">TMA</th>
                              <th className="pb-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Gap Médio</th>
                              <th className="pb-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Pausas (&gt;1h)</th>
                              <th className="pb-6 pr-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Score</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {operators.filter(op => op.role !== 'ADMIN').map(op => {
                                                            const opEvents = events.filter(e => e.operatorId === op.id);
                              const isWhatsAppEvent = (e: any) => 
                                 e.eventType === OperatorEventType.WHATSAPP_COMPLETE || 
                                 e.eventType === OperatorEventType.WHATSAPP_START || 
                                 e.eventType === OperatorEventType.WHATSAPP_SKIP || 
                                 ((e.eventType === OperatorEventType.PULAR_ATENDIMENTO || e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO) && e.note?.toLowerCase().includes('whatsapp'));

                              const opCallsCount = opEvents.filter(e => e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO && !e.note?.toLowerCase().includes('whatsapp')).length;
                              const opCalls = opCallsCount;
                                                            const opWaCount = opEvents.filter(isWhatsAppEvent).length;
                              const opSales = sales.filter(s => s.operatorId === op.id && s.status === SaleStatus.ENTREGUE);

                              const opCallsRecords = calls.filter(c => c.operatorId === op.id && c.type !== CallType.WHATSAPP);
                              const totalTime = opCallsRecords.reduce((acc, c) => acc + (c.duration || 0), 0);
                              const tma = opCallsCount > 0 ? totalTime / opCallsCount : 0;

                              // Gap Calculation
                                                            const sortedOpEvents = [...opEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                              const allGaps: any[] = [];
                              let lastEnd: number = 0;

                              sortedOpEvents.forEach(e => {
                                 const time = new Date(e.timestamp).getTime();
                                 const note = (e.note || '').toUpperCase();
                                 const isPuloAntes = e.eventType === OperatorEventType.PULAR_ATENDIMENTO && note.includes('[ANTES DA CHAMADA]');
                                 const isPuloDepois = e.eventType === OperatorEventType.PULAR_ATENDIMENTO && note.includes('[APÓS INICIAR]');

                                 const isEndEvent = [
                                    OperatorEventType.FINALIZAR_ATENDIMENTO, 
                                    OperatorEventType.WHATSAPP_COMPLETE, 
                                    OperatorEventType.WHATSAPP_SKIP
                                 ].includes(e.eventType) || isPuloDepois || isPuloAntes; // Both types of pulo "end" an active state (or the attempt)

                                 const isStartEvent = [
                                    OperatorEventType.INICIAR_PROXIMO_ATENDIMENTO, 
                                    OperatorEventType.WHATSAPP_START
                                 ].includes(e.eventType) || isPuloAntes; // Pulo antes also "ends" the gap state

                                 // 1. If it's a start event, record the gap since last end
                                 if (lastEnd > 0 && isStartEvent) {
                                    const diff = (time - lastEnd) / 1000;
                                    if (diff > 0) {
                                       allGaps.push({
                                          start: lastEnd,
                                          end: time,
                                          duration: diff,
                                          isLong: diff >= 3600
                                       });
                                    }
                                    lastEnd = 0; // Clear it so we don't count the same end twice
                                 }

                                 // 2. If it's an end event, mark the timestamp for the next gap
                                 if (isEndEvent) {
                                    lastEnd = time;
                                 }
                              });

                              const filteredGaps = allGaps.filter(g => !g.isLong).map(g => g.duration);
                              const medianGap = getMedian(filteredGaps);
                              const longPausesCount = allGaps.filter(g => g.isLong).length;

                              // Simple Score: (Calls + WA) + (Sales * 5) - (Gap > 60s penalties)
                                                            const score = (opCalls + opWaCount) + (opSales.length * 5) - (medianGap > 60 ? (medianGap - 60) * 0.1 : 0);

                              return (
                                 <tr key={op.id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="py-6 pl-4 font-black text-slate-700 text-sm">{op.name}</td>
                                    <td className="py-6 text-center text-xs font-bold text-slate-600">{opCalls}</td>
                                    <td className="py-6 text-center text-xs font-bold text-slate-600">{opWaCount}</td>
                                    <td className="py-6 text-center text-xs font-black text-emerald-600">{opSales.length}</td>
                                    <td className="py-6 text-center text-xs font-mono text-slate-500">{Math.floor(tma / 60)}m {Math.round(tma % 60)}s</td>
                                    <td className="py-6 text-center" onClick={() => setSelectedGapAudit({ op, gaps: allGaps })}>
                                       <div className="flex flex-col items-center cursor-pointer hover:scale-105 transition-transform">
                                          <span className={`px-3 py-1 rounded-full text-[10px] font-black ${medianGap < 30 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                             {Math.floor(medianGap / 60)}m {Math.round(medianGap % 60)}s
                                          </span>
                                          <span className="text-[8px] font-black text-blue-500 uppercase mt-1">Audit GAP</span>
                                       </div>
                                    </td>
                                    <td className="py-6 text-center">
                                       <span className={`px-3 py-1 rounded-full text-[10px] font-black ${longPausesCount === 0 ? 'bg-slate-100 text-slate-400' : 'bg-rose-100 text-rose-700'}`}>
                                          {longPausesCount}
                                       </span>
                                    </td>
                                    <td className="py-6 pr-4 text-right font-black text-blue-600">{Math.max(0, Math.round(score))}</td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               )}

               {/* AUDIT TAB */}
               {activeTab === 'audit' && (
                  <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm space-y-6">
                     <div className="flex flex-wrap gap-4 items-center justify-between pb-6 border-b border-slate-50">
                        <div className="flex gap-4 items-center flex-1">
                           <div className="relative flex-1 max-w-sm">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                              <input
                                 type="text"
                                 placeholder="Buscar por cliente ou telefone..."
                                 value={searchTerm}
                                 onChange={e => setSearchTerm(e.target.value)}
                                 className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-400 text-sm"
                              />
                           </div>
                           <select
                              value={filterOperator}
                              onChange={e => setFilterOperator(e.target.value)}
                              className="px-4 py-3 bg-slate-50 rounded-2xl font-bold text-slate-600 outline-none text-sm cursor-pointer hover:bg-slate-100"
                           >
                              <option value="all">Todos Operadores</option>
                              {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                           </select>
                           <select
                              value={filterType}
                              onChange={e => setFilterType(e.target.value as any)}
                              className="px-4 py-3 bg-slate-50 rounded-2xl font-bold text-slate-600 outline-none text-sm cursor-pointer hover:bg-slate-100"
                           >
                              <option value="all">Todos Tipos</option>
                              <option value="call">Ligações</option>
                              <option value="whatsapp">WhatsApp</option>
                           </select>
                        </div>
                        <div className="text-sm font-black text-slate-400 uppercase tracking-widest">
                           {getFilteredAuditData().length} Registros
                        </div>
                     </div>

                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                           <thead className="bg-slate-50/50 border-b border-slate-100">
                              <tr>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest pl-8">Data/Hora</th>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Tipo</th>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Operador</th>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente</th>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Duração</th>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                                 <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Ações</th>
                              </tr>
                           </thead>
                            <tbody className="divide-y divide-slate-50">
                               {getFilteredAuditData().slice(0, 100).map((item: any, i) => {
                                 const isCall = item._type === 'call';
                                 const isWhatsApp = item.type === CallType.WHATSAPP || item._type === 'whatsapp';
                                 const date = new Date(isCall ? item.startTime : item.createdAt).toLocaleString();
                                 const opName = operators.find(o => o.id === (isCall ? item.operatorId : item.assignedTo))?.name || 'N/A';
                                 const clientName = item.clientName || clients.find(c => c.id === item.clientId)?.name || prospects.find(p => p.id === item.clientId)?.name || 'N/A';

                                 return (
                                    <tr
                                       key={item.id + i}
                                       onClick={() => setSelectedInteraction(item)}
                                       className="hover:bg-blue-50/50 cursor-pointer group transition-colors"
                                    >
                                       <td className="py-4 px-6 text-xs font-bold text-slate-600 pl-8">{date}</td>
                                       <td className="py-4 px-6">
                                          <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${!isWhatsApp ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                             {!isWhatsApp ? 'Ligação' : 'WhatsApp'}
                                          </span>
                                          {item.relatedVisit ? (
                                             <div>
                                                <p className="font-bold text-slate-800">Detalhes da Visita</p>
                                                <p className="text-sm text-slate-600">Data: {new Date((item.relatedVisit as any).scheduledDate || item.relatedVisit.createdAt).toLocaleDateString()}</p>
                                                <p className="text-sm text-slate-600">Status: {item.relatedVisit.status}</p>
                                                {item.relatedVisit.notes && <p className="text-sm text-slate-500 italic mt-2">"{item.relatedVisit.notes}"</p>}
                                             </div>
                                          ) : null}
                                       </td>
                                       <td className="py-4 px-6 text-xs text-slate-600">{opName}</td>
                                       <td className="py-4 px-6 text-xs font-bold text-slate-800">{clientName}</td>
                                       <td className="py-4 px-6 text-xs font-mono text-slate-500">{isCall ? `${item.duration}s` : '-'}</td>
                                       <td className="py-4 px-6 text-xs font-bold text-slate-500 uppercase">{isCall ? 'Concluída' : item.status}</td>
                                       <td className="py-4 px-6">
                                          <button className="text-blue-500 opacity-0 group-hover:opacity-100 font-bold text-xs uppercase hover:underline">
                                             Ver Detalhes
                                          </button>
                                       </td>
                                    </tr>
                                 );
                              })}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}

               {/* LEADS TAB */}
               {activeTab === 'leads' && (
                  <div className="space-y-8">
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <MetricCard
                           title="Total de Leads"
                           value={prospects.length}
                           icon={Target}
                           color="blue"
                        />
                        <MetricCard
                           title="Leads Qualificados"
                           value={prospects.filter(p => p.funnel_status === 'QUALIFIED' || p.funnel_status === 'PROPOSAL_SENT').length}
                           icon={Trophy}
                           color="emerald"
                        />
                        <MetricCard
                           title="Em Negociação"
                           value={prospects.filter(p => p.funnel_status === 'PROPOSAL_SENT' || p.funnel_status === 'PHYSICAL_VISIT').length}
                           icon={DollarSign}
                           color="amber"
                        />
                        <MetricCard
                           title="Novos (Essa Semana)"
                           value={prospects.length} // Placeholder for now, date filtering on prospects needs createdAt
                           icon={Zap}
                           color="slate"
                           subtitle="Sem filtros de data ainda"
                        />
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Funnel Status Breakdown */}
                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Funil de Vendas</h4>
                           <div className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <BarChart layout="vertical" data={Object.entries(prospects.reduce((acc: any, p) => {
                                    const status = p.funnel_status || 'NEW';
                                    acc[status] = (acc[status] || 0) + 1;
                                    return acc;
                                 }, {})).map(([name, value]) => ({ name, value }))}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fontWeight: 700 }} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={30}>
                                       <Cell fill="#3b82f6" />
                                    </Bar>
                                 </BarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>

                        {/* Leads by Origin */}
                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Origem dos Leads</h4>
                           <div className="h-[300px] flex justify-center">
                              <ResponsiveContainer width="100%" height="100%">
                                 <PieChart>
                                    <Pie
                                       data={Object.entries(prospects.reduce((acc: any, p) => {
                                          const origin = p.origin || 'Desconhecido';
                                          acc[origin] = (acc[origin] || 0) + 1;
                                          return acc;
                                       }, {})).map(([name, value]) => ({ name, value }))}
                                       innerRadius={60}
                                       outerRadius={100}
                                       paddingAngle={2}
                                       dataKey="value"
                                    >
                                       <Cell fill="#3b82f6" />
                                       <Cell fill="#10b981" />
                                       <Cell fill="#f59e0b" />
                                       <Cell fill="#ef4444" />
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                 </PieChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                     </div>
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Motivações de Pulo */}
                        <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm col-span-1 lg:col-span-3">
                           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center justify-between">
                              Principais Motivações de Pulo (Hoje)
                              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px]">{metrics.pureSkips || 0} Pulos Diretos</span>
                           </h4>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {(() => {
                                  if (skipAuditData.length === 0) {
                                     return <div className="col-span-1 md:col-span-2 lg:col-span-4 text-slate-400 text-xs font-bold text-center py-10 bg-slate-50 rounded-[32px]">Nenhum pulo registrado hoje.</div>;
                                  }
                                  
                                  const reasonCounts = skipAuditData.reduce((acc, curr) => {
                                      const reason = curr.note || 'Sem motivo informado';
                                      acc[reason] = (acc[reason] || 0) + 1;
                                      return acc;
                                  }, {} as Record<string, number>);

                                   const sortedReasons = Object.entries(reasonCounts).sort((a,b) => (b[1] as number) - (a[1] as number));

                                  return sortedReasons.map(([reason, count]) => (
                                      <div key={reason} className="flex justify-between items-start gap-4 p-5 bg-slate-50 rounded-[24px] border border-slate-100">
                                          <span className="text-xs font-bold text-slate-700 leading-relaxed">{reason}</span>
                                           <span className="text-xs font-black text-slate-900 bg-white px-3 py-1 rounded-full shadow-sm shrink-0">{count as number}</span>
                                      </div>
                                  ));
                              })()}
                           </div>
                        </div>
                     </div>

                  </div>
               )}

               {/* INVALID PHONES TAB */}
               {activeTab === 'invalid_phones' && (
                  <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm space-y-6">
                     <div className="flex justify-between items-center mb-6">
                         <div>
                             <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Telefones Inválidos ({invalidClients.length})</h3>
                             <p className="text-sm font-medium text-slate-500">Clientes sinalizados pelos operadores ou sistema como número inexistente.</p>
                         </div>
                     </div>
                     <table className="w-full text-left">
                        <thead className="border-b border-slate-100">
                           <tr>
                              <th className="pb-4 pl-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Nome</th>
                              <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Telefone Incorreto</th>
                              <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Origem / Status</th>
                              <th className="pb-4 text-right pr-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Ação</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {invalidClients.map(c => (
                              <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                                 <td className="p-4 font-bold text-slate-800">{c.name}</td>
                                 <td className="p-4 text-red-500 font-mono text-sm">{c.phone}</td>
                                 <td className="p-4">
                                     <span className="text-[9px] font-black uppercase bg-slate-100 px-2 py-1 rounded">{c.origin || 'MANUAL'}</span>
                                 </td>
                                 <td className="p-4 text-right">
                                     <button
                                         onClick={async () => {
                                             const newPhone = prompt("Digite o número de telefone correto para " + c.name + ":", c.phone);
                                             if (newPhone && newPhone !== c.phone) {
                                                 await dataService.updateClientFields(c.id, { phone: newPhone, invalid: false });
                                                 alert("Telefone atualizado! O cliente retornará para a fila normal.");
                                                 loadData();
                                             }
                                         }}
                                         className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                                     >
                                         Corrigir Número
                                     </button>
                                 </td>
                              </tr>
                           ))}
                           {invalidClients.length === 0 && (
                               <tr>
                                   <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">Nenhum cliente com telefone inválido no momento.</td>
                               </tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               )}

               {/* POST-SALE & REMARKETING TAB */}
               {activeTab === 'post_sale' && (
                  <PostSaleRemarketingReport
                     user={user}
                     operators={operators}
                     onOpenProspect={(id: string) => setDrawerProspectId(id)}
                  />
               )}


            </div>
         )}

         {/* RENDER MODAL */}
         {/* MODAL DE AUDITORIA DE PULOS */}
         {isSkipAuditModalOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white rounded-[48px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                  <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                     <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Pulos Diretos (Hoje)</h3>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Lista de clientes pulados sem mensagem gerada</p>
                     </div>
                     <button onClick={() => setIsSkipAuditModalOpen(false)} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:scale-110 active:scale-95 transition-all shadow-sm">
                        <X size={20} />
                     </button>
                  </div>
                  <div className="p-8 overflow-y-auto bg-slate-50/30 flex-1">
                     {skipAuditData.length === 0 ? (
                        <div className="text-center py-12">
                           <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
                           <p className="text-slate-500 font-bold">Nenhum pulo direto hoje.</p>
                        </div>
                     ) : (
                        <div className="space-y-4">
                           {skipAuditData.map((skip, idx) => (
                              <div key={idx} className="bg-white p-6 rounded-[32px] border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                 <div>
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{new Date(skip.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                       <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{skip.operatorName}</span>
                                    </div>
                                    <p className="font-bold text-slate-900 flex items-center gap-2">
                                       <Users size={16} className="text-slate-400" />
                                       {skip.clientName}
                                    </p>
                                 </div>
                                 {skip.note && (
                                    <div className="bg-amber-50 rounded-[16px] p-3 text-xs font-medium text-amber-800 border border-amber-100 flex-1 sm:max-w-[50%]">
                                       {skip.note}
                                    </div>
                                 )}
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}
         {renderInteractionDetails()}
         {renderGapAuditModal()}
         {drawerProspectId && (
            <ProspectHistoryDrawer
               prospectId={drawerProspectId}
               onClose={() => setDrawerProspectId(null)}
            />
         )}
      </div>
   );
};

export default Reports;
