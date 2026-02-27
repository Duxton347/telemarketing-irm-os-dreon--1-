
import React from 'react';
import { 
  Search, User, Plus, X, 
  History, UserCheck, Clock, CheckCircle2, 
  Play, RotateCcw, UserPlus, Save, MessageSquare, AlertTriangle, MoreVertical,
  ChevronRight, ThumbsUp, ThumbsDown, Loader2, MapPin, Tag, ClipboardList,
  Check, Send, ClipboardCheck, ListChecks, MessageCircle, FileText
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Protocol, ProtocolStatus, UserRole, ProtocolEvent, User as UserType, Client, Question, CallType } from '../types';
import { PROTOCOL_SLA } from '../constants';

const Protocols: React.FC<{ user: UserType }> = ({ user }) => {
  if (!user || !user.id) return <div className="p-20 text-center font-black uppercase text-slate-300 animate-pulse">Autenticando sessão...</div>;

  const [protocols, setProtocols] = React.useState<Protocol[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [operators, setOperators] = React.useState<UserType[]>([]);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [protocolEvents, setProtocolEvents] = React.useState<ProtocolEvent[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [deptFilter, setDeptFilter] = React.useState<string>('all');
  
  const [selectedProtocol, setSelectedProtocol] = React.useState<Protocol | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = React.useState(false);
  
  // Estados para o formulário de resolução
  const [resolutionSummary, setResolutionSummary] = React.useState('');
  const [resolutionResponses, setResolutionResponses] = React.useState<Record<string, string>>({});
  
  // Estado para novas notas de acompanhamento
  const [internalNote, setInternalNote] = React.useState('');

  // Estados para modais de gestão
  const [reassignTarget, setReassignTarget] = React.useState<Protocol | null>(null);
  const [newOwnerId, setNewOwnerId] = React.useState('');
  const [rejectProtocol, setRejectProtocol] = React.useState<Protocol | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');

  const config = dataService.getProtocolConfig();

  const [newProto, setNewProto] = React.useState({
    clientId: '', 
    clientSearch: '', 
    manualName: '', 
    manualPhone: '', 
    manualAddress: '',
    title: '', 
    description: '', 
    departmentId: config.departments[0]?.id || 'atendimento',
    priority: 'Média' as 'Baixa' | 'Média' | 'Alta', 
    ownerOperatorId: user.id
  });

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [allProtocols, allClients, allUsers, allQuestions] = await Promise.all([
        dataService.getProtocols(),
        dataService.getClients(),
        dataService.getUsers(),
        dataService.getQuestions()
      ]);

      setClients(allClients);
      setOperators(allUsers.filter(u => u.active));
      setQuestions(allQuestions.filter(q => q.type === CallType.CONFIRMACAO_PROTOCOLO));

      const visible = user.role === UserRole.ADMIN 
        ? allProtocols 
        : allProtocols.filter(p => p && (p.ownerOperatorId === user.id || p.openedByOperatorId === user.id));
      
      setProtocols(visible);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [user]);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (selectedProtocol) {
      dataService.getProtocolEvents(selectedProtocol.id).then(setProtocolEvents);
      setResolutionSummary(selectedProtocol.resolutionSummary || '');
      setInternalNote('');
      setResolutionResponses({});
    }
  }, [selectedProtocol]);

  const handleCreateProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProto.title.trim() || !newProto.description.trim()) return alert("Preencha o título e a descrição.");
    
    let targetClientId = newProto.clientId;

    setIsProcessing(true);
    try {
      // Se não tem cliente selecionado mas tem dados manuais, cria o cliente primeiro
      if (!targetClientId && newProto.manualName && newProto.manualPhone) {
        const newClient = await dataService.upsertClient({
          name: newProto.manualName,
          phone: newProto.manualPhone,
          address: newProto.manualAddress
        });
        targetClientId = newClient.id;
      }

      if (!targetClientId) throw new Error("Selecione ou cadastre um cliente.");

      const slaHours = PROTOCOL_SLA[newProto.priority] || 48;
      const now = new Date();
      
      const p: Partial<Protocol> = {
        clientId: targetClientId,
        openedByOperatorId: user.id,
        ownerOperatorId: newProto.ownerOperatorId,
        departmentId: newProto.departmentId,
        title: newProto.title.trim(),
        description: newProto.description.trim(),
        priority: newProto.priority,
        status: ProtocolStatus.ABERTO,
        openedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        slaDueAt: new Date(now.getTime() + slaHours * 3600000).toISOString()
      };

      await dataService.saveProtocol(p as Protocol, user.id);
      setIsNewModalOpen(false);
      setNewProto({
        clientId: '', clientSearch: '', manualName: '', manualPhone: '', manualAddress: '',
        title: '', description: '', departmentId: config.departments[0]?.id || 'atendimento',
        priority: 'Média', ownerOperatorId: user.id
      });
      await loadData();
      alert("Protocolo aberto com sucesso!");
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateStatus = async (pId: string, status: ProtocolStatus, note?: string) => {
    if (status === ProtocolStatus.RESOLVIDO_PENDENTE) {
      if (!resolutionSummary.trim() || Object.keys(resolutionResponses).length < questions.length) {
        return alert("Por favor, responda todas as perguntas de auditoria e preencha o resumo da solução.");
      }
    }

    setIsProcessing(true);
    try {
      let finalSummary = resolutionSummary;
      if (status === ProtocolStatus.RESOLVIDO_PENDENTE) {
        const qTexts = questions.map(q => `${q.text}: ${resolutionResponses[q.id]}`).join('\n');
        finalSummary = `AUDITORIA DE FECHAMENTO:\n${qTexts}\n\nRESUMO DO OPERADOR:\n${resolutionSummary}`;
      }

      await dataService.updateProtocol(pId, { status, resolutionSummary: status === ProtocolStatus.RESOLVIDO_PENDENTE ? finalSummary : undefined }, user.id, note || `Mudança para: ${status}`);
      await loadData();
      if (selectedProtocol?.id === pId) {
         const updated = await dataService.getProtocols();
         setSelectedProtocol(updated.find(up => up.id === pId) || null);
      }
      alert("Status atualizado!");
    } catch (e) { alert("Erro ao atualizar."); }
    finally { setIsProcessing(false); }
  };

  const handleAddInternalNote = async () => {
    if (!selectedProtocol || !internalNote.trim()) return;
    setIsProcessing(true);
    try {
      await dataService.updateProtocol(selectedProtocol.id, {}, user.id, `ATUALIZAÇÃO DE ACOMPANHAMENTO: ${internalNote}`);
      setInternalNote('');
      const events = await dataService.getProtocolEvents(selectedProtocol.id);
      setProtocolEvents(events);
      alert("Nota registrada no histórico!");
    } catch (e) { alert("Erro ao salvar nota."); }
    finally { setIsProcessing(false); }
  };

  const handleReassign = async () => {
    if (!reassignTarget || !newOwnerId) return;
    setIsProcessing(true);
    try {
      const targetOp = operators.find(o => o.id === newOwnerId);
      await dataService.updateProtocol(reassignTarget.id, { ownerOperatorId: newOwnerId }, user.id, `Chamado reatribuído para o operador: ${targetOp?.name}`);
      await loadData();
      setReassignTarget(null);
      setSelectedProtocol(null);
      alert("Protocolo reatribuído com sucesso!");
    } catch (e) { alert("Erro ao reatribuir."); }
    finally { setIsProcessing(false); }
  };

  const handleAdminApprove = async (pId: string) => {
    setIsProcessing(true);
    try {
      await dataService.updateProtocol(pId, { status: ProtocolStatus.FECHADO, closedAt: new Date().toISOString() }, user.id, "Resolução APROVADA pelo gestor. Protocolo arquivado.");
      await loadData();
      setSelectedProtocol(null);
      alert("Protocolo encerrado e salvo nos registros!");
    } catch (e) { alert("Erro ao aprovar."); }
    finally { setIsProcessing(false); }
  };

  const calculateTimeOpen = (openedAt: string) => {
    const diff = new Date().getTime() - new Date(openedAt).getTime();
    const hours = Math.floor(diff / 3600000);
    return hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
  };

  const filtered = protocols.filter(p => {
    const matchSearch = (p.title || "").toLowerCase().includes(search.toLowerCase()) || (p.protocolNumber || "").includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchDept = deptFilter === 'all' || p.departmentId === deptFilter;
    return matchSearch && matchStatus && matchDept;
  }).sort((a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime());

  const filteredClientsForSearch = clients.filter(c => 
    newProto.clientSearch && (
      c.name.toLowerCase().includes(newProto.clientSearch.toLowerCase()) || 
      c.phone.includes(newProto.clientSearch)
    )
  );

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Gestão de Protocolos</h2>
          <p className="text-slate-500 text-sm font-bold">Inicie, acompanhe e audite o ciclo de vida dos chamados.</p>
        </div>
        <button onClick={() => setIsNewModalOpen(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-700 active:scale-95 flex items-center gap-2"><Plus size={18} /> Abrir Chamado</button>
      </header>

      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input type="text" placeholder="Buscar por assunto ou nº protocolo..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none">
          <option value="all">Status: Todos</option>
          {Object.values(ProtocolStatus).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none">
          <option value="all">Setor: Todos</option>
          {config.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map(p => {
          const isAberto = p.status === ProtocolStatus.ABERTO || p.status === ProtocolStatus.REABERTO;
          const isPending = p.status === ProtocolStatus.RESOLVIDO_PENDENTE;
          
          return (
            <div 
              key={p.id} 
              onClick={() => setSelectedProtocol(p)}
              className={`p-6 rounded-[32px] border-2 transition-all flex flex-col md:flex-row gap-6 items-center cursor-pointer 
                ${isAberto ? 'bg-red-50/50 border-red-500 shadow-xl shadow-red-500/10 animate-pulse' : 
                  isPending ? 'bg-orange-50 border-orange-400 shadow-xl shadow-orange-500/10' : 'bg-white border-slate-100 hover:border-blue-400'}`}
            >
              <div className="flex-1 space-y-2 w-full">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${isAberto ? 'bg-red-600 text-white shadow-lg' : isPending ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`}>{p.status}</span>
                  <span className="text-[10px] font-black text-slate-300">#{p.protocolNumber || p.id.substring(0,8)}</span>
                </div>
                <h3 className="text-lg font-black text-slate-800 leading-tight uppercase tracking-tight">{p.title}</h3>
                <div className="flex items-center gap-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><User size={12} className="text-blue-500"/> {operators.find(o => o.id === p.ownerOperatorId)?.name || 'N/A'}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Tag size={12} className="text-indigo-500"/> {config.departments.find(d => d.id === p.departmentId)?.name}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-6 shrink-0">
                {p.ownerOperatorId === user.id && isAberto && (
                  <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(p.id, ProtocolStatus.EM_ANDAMENTO, "Operador iniciou o atendimento."); }} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase shadow-lg flex items-center gap-2 hover:bg-blue-700 transition-all"><Play size={14} /> Iniciar</button>
                )}
                {user.role === UserRole.ADMIN && (
                   <button onClick={(e) => { e.stopPropagation(); setReassignTarget(p); }} className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-md group" title="Reatribuir">
                     <UserPlus size={20} className="group-hover:scale-110 transition-transform" />
                   </button>
                )}
                <div className="text-right border-l pl-4 border-slate-100 min-w-[80px]">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Aberto há</p>
                  <p className={`font-black text-sm ${isAberto ? 'text-red-600' : 'text-slate-800'}`}>{calculateTimeOpen(p.openedAt)}</p>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="py-20 text-center text-slate-300 font-black uppercase text-xs tracking-widest opacity-40">Sem protocolos na lista.</div>}
      </div>

      {/* MODAL NOVO PROTOCOLO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
              <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
                 <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                   <ClipboardList className="text-blue-400" /> Abrir Novo Chamado
                 </h3>
                 <button onClick={() => setIsNewModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-all"><X size={24} /></button>
              </div>
              
              <form onSubmit={handleCreateProtocol} className="p-10 space-y-6 overflow-y-auto custom-scrollbar">
                 <div className="space-y-4 bg-slate-50 p-6 rounded-[32px] border border-slate-100">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <MapPin size={14} /> Identificação do Cliente
                    </h5>
                    
                    {!newProto.clientId ? (
                      <div className="space-y-3">
                         <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                              type="text" 
                              placeholder="Pesquisar por nome ou celular..." 
                              value={newProto.clientSearch}
                              onChange={e => setNewProto({...newProto, clientSearch: e.target.value})}
                              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                         </div>
                         {filteredClientsForSearch.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-2 space-y-1 shadow-inner">
                               {filteredClientsForSearch.slice(0, 5).map(c => (
                                 <button key={c.id} type="button" onClick={() => setNewProto({...newProto, clientId: c.id, clientSearch: c.name})} className="w-full text-left p-3 hover:bg-blue-50 rounded-xl transition-all flex justify-between items-center">
                                    <span className="font-black text-slate-800 text-xs uppercase">{c.name}</span>
                                    <span className="text-[10px] text-blue-500 font-bold">{c.phone}</span>
                                 </button>
                               ))}
                            </div>
                         )}
                         <div className="text-center py-2"><span className="text-[9px] font-black text-slate-300 uppercase">Ou cadastre manualmente</span></div>
                         <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="Nome Manual" value={newProto.manualName} onChange={e => setNewProto({...newProto, manualName: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" />
                            <input type="text" placeholder="Telefone Manual" value={newProto.manualPhone} onChange={e => setNewProto({...newProto, manualPhone: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" />
                         </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center p-4 bg-blue-600 text-white rounded-2xl">
                         <div>
                            <p className="text-[10px] font-black uppercase opacity-60">Cliente Selecionado</p>
                            <p className="font-black text-sm uppercase">{clients.find(c => c.id === newProto.clientId)?.name}</p>
                         </div>
                         <button type="button" onClick={() => setNewProto({...newProto, clientId: '', clientSearch: ''})} className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-all"><X size={16} /></button>
                      </div>
                    )}
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assunto do Protocolo</label>
                       <input type="text" required value={newProto.title} onChange={e => setNewProto({...newProto, title: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-blue-500 transition-all" placeholder="Ex: Equipamento com vazamento..." />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor Responsável</label>
                       <select value={newProto.departmentId} onChange={e => setNewProto({...newProto, departmentId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none">
                          {config.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Prioridade (SLA)</label>
                       <select value={newProto.priority} onChange={e => setNewProto({...newProto, priority: e.target.value as any})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none">
                          <option value="Baixa">Baixa (72h)</option>
                          <option value="Média">Média (48h)</option>
                          <option value="Alta">Alta (24h)</option>
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsável Inicial</label>
                       <select value={newProto.ownerOperatorId} onChange={e => setNewProto({...newProto, ownerOperatorId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none">
                          {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Problema / Solicitação</label>
                    <textarea required value={newProto.description} onChange={e => setNewProto({...newProto, description: e.target.value})} className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[32px] font-bold text-sm h-32 resize-none outline-none focus:border-blue-500 transition-all" placeholder="Relate o que o cliente informou..." />
                 </div>

                 <button type="submit" disabled={isProcessing} className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50">
                    {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />} Abrir Registro e Notificar Responsável
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* MODAL DETALHES PROTOCOLO */}
      {selectedProtocol && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 overflow-hidden">
           <div className="bg-white w-full max-w-5xl h-[95vh] rounded-[56px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
              <div className="bg-slate-900 p-8 text-white flex justify-between items-start shrink-0">
                 <div>
                    <div className="flex items-center gap-3">
                       <span className="px-3 py-1 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest">{selectedProtocol.status}</span>
                       <span className="text-[10px] font-black text-slate-500 tracking-widest">ID #{selectedProtocol.protocolNumber || selectedProtocol.id.substring(0,8)}</span>
                    </div>
                    <h3 className="text-3xl font-black mt-2 tracking-tighter uppercase leading-tight">{selectedProtocol.title}</h3>
                 </div>
                 <button onClick={() => setSelectedProtocol(null)} className="p-3 hover:bg-white/10 rounded-full transition-all active:scale-90"><X size={28} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 md:grid-cols-12 gap-10 custom-scrollbar">
                 <div className="md:col-span-8 space-y-10">
                    <section>
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4 flex items-center gap-2"><FileText size={14}/> Relato do Cliente</h4>
                       <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 text-slate-700 font-bold whitespace-pre-wrap leading-relaxed shadow-sm italic">
                          "{selectedProtocol.description}"
                       </div>
                    </section>

                    {/* ACOMPANHAMENTO PASSO A PASSO (OPERADOR) */}
                    {(selectedProtocol.status !== ProtocolStatus.FECHADO) && (
                      <section className="space-y-6 bg-slate-50/50 p-8 rounded-[40px] border border-slate-100">
                         <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2"><MessageCircle size={16}/> Diário de Acompanhamento (Notas do Operador)</h4>
                         <div className="space-y-4">
                            <textarea 
                              value={internalNote} 
                              onChange={e => setInternalNote(e.target.value)} 
                              className="w-full p-6 bg-white border-2 border-slate-100 rounded-[32px] font-bold text-slate-800 h-32 resize-none outline-none focus:border-indigo-500 transition-all shadow-inner" 
                              placeholder="Registre o que está sendo feito agora para este chamado... (ex: Tentei contato, Aguardando peça...)" 
                            />
                            <div className="flex justify-end">
                               <button 
                                onClick={handleAddInternalNote} 
                                disabled={isProcessing || !internalNote.trim()} 
                                className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                               >
                                  {isProcessing ? <Loader2 className="animate-spin"/> : <Save size={16}/>} Salvar Atualização
                               </button>
                            </div>
                         </div>
                      </section>
                    )}
                    
                    {/* ÁREA DE RESOLUÇÃO FINAL */}
                    {selectedProtocol.status === ProtocolStatus.EM_ANDAMENTO && selectedProtocol.ownerOperatorId === user.id && (
                       <section className="space-y-8 p-10 bg-emerald-50/30 rounded-[48px] border-2 border-emerald-200 animate-in slide-in-from-bottom-4">
                          <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-3"><ListChecks size={22} /> Auditoria de Encerramento Obrigatória</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {questions.map(q => (
                                <div key={q.id} className="p-5 bg-white rounded-3xl border border-emerald-100 shadow-sm space-y-4">
                                   <p className="text-[10px] font-black text-slate-700 leading-tight uppercase tracking-tight">{q.text}</p>
                                   <div className="flex flex-wrap gap-2">
                                      {q.options.map(opt => (
                                         <button key={opt} onClick={() => setResolutionResponses({ ...resolutionResponses, [q.id]: opt })} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${resolutionResponses[q.id] === opt ? 'bg-emerald-600 text-white shadow-xl' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{opt}</button>
                                      ))}
                                   </div>
                                </div>
                             ))}
                          </div>
                          <div className="space-y-4">
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo Técnico da Solução</h4>
                             <textarea value={resolutionSummary} onChange={e => setResolutionSummary(e.target.value)} className="w-full p-6 bg-white border border-emerald-100 rounded-[32px] font-bold text-slate-800 h-48 resize-none outline-none focus:ring-8 focus:ring-emerald-500/5 transition-all shadow-inner" placeholder="Explique detalhadamente como o problema foi resolvido." />
                          </div>
                          <button onClick={() => handleUpdateStatus(selectedProtocol.id, ProtocolStatus.RESOLVIDO_PENDENTE)} disabled={isProcessing} className="w-full py-6 bg-emerald-600 text-white rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95">{isProcessing ? <Loader2 className="animate-spin" /> : <ClipboardCheck size={20} />} Enviar para Auditoria do Gestor</button>
                       </section>
                    )}

                    {/* HISTÓRICO INTEGRADO */}
                    <section className="space-y-6">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                          <History size={14} /> Histórico de Auditoria & Cronologia
                       </h4>
                       <div className="space-y-4">
                          {protocolEvents.length > 0 ? protocolEvents.map((e) => (
                            <div key={e.id} className="flex gap-4 animate-in slide-in-from-left-2">
                               <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0"><Clock size={16} /></div>
                               <div className="flex-1 bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm">
                                  <div className="flex justify-between items-start mb-2">
                                     <p className="text-[9px] font-black text-slate-800 uppercase tracking-tighter bg-slate-50 px-2 py-0.5 rounded">{e.eventType === 'status_change' ? 'Status Alterado' : 'Anotação Operacional'}</p>
                                     <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">{new Date(e.createdAt).toLocaleString()}</span>
                                  </div>
                                  <p className="text-xs text-slate-600 font-bold italic whitespace-pre-wrap leading-relaxed">"{e.note}"</p>
                                  <p className="text-[8px] text-blue-500 font-black uppercase tracking-widest mt-3 flex items-center gap-1"><User size={10}/> Ator: {operators.find(o => o.id === e.actorId)?.name || 'Sistema'}</p>
                               </div>
                            </div>
                          )) : (
                            <p className="text-[10px] font-black text-slate-300 uppercase text-center py-10 tracking-widest">Nenhum evento registrado</p>
                          )}
                       </div>
                    </section>
                 </div>

                 {/* BARRA LATERAL INFO */}
                 <div className="md:col-span-4 space-y-6">
                    <div className="p-8 bg-slate-900 rounded-[40px] text-white shadow-2xl space-y-6">
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Responsável Atual</p>
                          <p className="font-black text-lg text-blue-400">{operators.find(o => o.id === selectedProtocol.ownerOperatorId)?.name || 'N/A'}</p>
                       </div>
                       <div className="text-center border-t border-slate-800 pt-4">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tempo de Abertura</p>
                          <p className="text-3xl font-black text-white">{calculateTimeOpen(selectedProtocol.openedAt)}</p>
                       </div>
                    </div>

                    {user.role === UserRole.ADMIN && selectedProtocol.status === ProtocolStatus.RESOLVIDO_PENDENTE && (
                       <div className="space-y-4 p-8 bg-white border border-slate-100 rounded-[40px] shadow-sm animate-in zoom-in">
                          <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center">Decisão Auditoria</h5>
                          <button onClick={() => handleAdminApprove(selectedProtocol.id)} className="w-full py-5 bg-emerald-500 text-white rounded-[24px] font-black uppercase text-[10px] shadow-xl flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95"><ThumbsUp size={18}/> Aprovar Solução</button>
                          <button onClick={() => setRejectProtocol(selectedProtocol)} className="w-full py-5 bg-red-600 text-white rounded-[24px] font-black uppercase text-[10px] shadow-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-95"><ThumbsDown size={18}/> Rejeitar e Devolver</button>
                       </div>
                    )}
                    
                    <div className="p-8 bg-white border border-slate-100 rounded-[40px] shadow-sm space-y-4">
                        <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={12}/> Cliente Relacionado</h5>
                        <p className="font-black text-slate-800 text-sm uppercase">{clients.find(c => c.id === selectedProtocol.clientId)?.name}</p>
                        <p className="text-[10px] font-bold text-blue-600">{clients.find(c => c.id === selectedProtocol.clientId)?.phone}</p>
                    </div>

                    {user.role === UserRole.ADMIN && (
                       <button onClick={() => { setReassignTarget(selectedProtocol); setNewOwnerId(''); }} className="w-full p-6 bg-indigo-50 text-indigo-600 rounded-[32px] font-black uppercase text-[10px] flex items-center justify-center gap-3 hover:bg-indigo-600 hover:text-white transition-all shadow-sm group">
                          <UserPlus size={18} className="group-hover:rotate-12 transition-transform" /> Reatribuir Serviço
                       </button>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE REATRIBUIÇÃO */}
      {reassignTarget && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-black uppercase tracking-tighter">Transferir Protocolo</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Selecione o novo colaborador</p>
                 </div>
                 <button onClick={() => setReassignTarget(null)} className="hover:bg-white/10 p-3 rounded-full transition-all active:scale-90"><X size={24} /></button>
              </div>
              <div className="p-10 space-y-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operador Destino</label>
                    <select 
                      value={newOwnerId} 
                      onChange={e => setNewOwnerId(e.target.value)}
                      className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[24px] font-black text-[12px] uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                    >
                       <option value="">Selecione um colaborador...</option>
                       {operators.filter(u => u.id !== reassignTarget.ownerOperatorId).map(u => (
                         <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                       ))}
                    </select>
                 </div>
                 <div className="p-5 bg-yellow-50 rounded-[28px] border border-yellow-100 flex gap-4 items-start shadow-sm">
                    <AlertTriangle size={24} className="text-yellow-600 shrink-0" />
                    <p className="text-[10px] font-bold text-yellow-800 leading-relaxed uppercase tracking-tight">O novo operador assumirá o chamado imediatamente com todo o histórico preservado.</p>
                 </div>
                 <button 
                  onClick={handleReassign}
                  disabled={isProcessing || !newOwnerId}
                  className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                 >
                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />} Confirmar Reatribuição
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL REJEIÇÃO */}
      {rejectProtocol && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="bg-red-600 p-8 text-white flex justify-between items-center">
                 <h3 className="font-black uppercase text-sm tracking-widest">Rejeitar e Reabrir</h3>
                 <button onClick={() => setRejectProtocol(null)}><X size={24} /></button>
              </div>
              <div className="p-10 space-y-6">
                 <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-bold text-sm h-40 resize-none outline-none focus:ring-8 focus:ring-red-500/5 transition-all" placeholder="Diga o que falta ou o que precisa ser corrigido..." />
                 <button onClick={async () => {
                   if (!rejectReason.trim()) return alert("Diga por que está rejeitando.");
                   setIsProcessing(true);
                   try {
                     await dataService.updateProtocol(rejectProtocol.id, { status: ProtocolStatus.EM_ANDAMENTO }, user.id, `REJEITADO PELO GESTOR: ${rejectReason}`);
                     setRejectProtocol(null);
                     setRejectReason('');
                     await loadData();
                     setSelectedProtocol(null);
                     alert("Protocolo devolvido para correção.");
                   } catch (e) { alert("Erro ao rejeitar."); }
                   finally { setIsProcessing(false); }
                 }} className="w-full py-6 bg-red-600 text-white rounded-[32px] font-black uppercase text-[10px] shadow-xl hover:bg-red-700 transition-all">Confirmar Devolução</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Protocols;
