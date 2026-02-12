
import React from 'react';
import { 
  Search, UserPlus, ChevronRight, Phone, History, Users, Calendar, X,
  MapPin, Tag, Save, Copy, MessageSquare, Edit2, Loader2, Database, ClipboardList, Clock, CheckCircle2, FileText
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { SATISFACTION_EMOJIS } from '../constants';
import { Client, CallRecord, UserRole, Protocol, ProtocolStatus } from '../types';

const Clients: React.FC<{ user: any }> = ({ user }) => {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [clientHistory, setClientHistory] = React.useState<{ calls: CallRecord[], protocols: Protocol[] }>({ calls: [], protocols: [] });
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  
  const [clientData, setClientData] = React.useState({
    id: '',
    name: '',
    phone: '',
    address: '',
    items: ''
  });

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const allClients = await dataService.getClients();
      setClients(allClients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => { loadClients(); }, []);

  // Carrega histórico quando um cliente é selecionado
  React.useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedClient) return;
      setHistoryLoading(true);
      try {
        const [allCalls, allProtocols] = await Promise.all([
          dataService.getCalls(),
          dataService.getProtocols()
        ]);
        setClientHistory({
          calls: allCalls.filter(c => c.clientId === selectedClient.id),
          protocols: allProtocols.filter(p => p.clientId === selectedClient.id)
        });
      } catch (e) {
        console.error("Erro ao carregar histórico:", e);
      } finally {
        setHistoryLoading(true);
        setTimeout(() => setHistoryLoading(false), 300);
      }
    };
    fetchHistory();
  }, [selectedClient]);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientData.name || !clientData.phone) return;

    setIsProcessing(true);
    try {
      await dataService.upsertClient({
        id: clientData.id || undefined,
        name: clientData.name,
        phone: clientData.phone,
        address: clientData.address,
        items: clientData.items.split(',').map(i => i.trim()).filter(i => i),
      });

      setIsModalOpen(false);
      setEditMode(false);
      setClientData({ id: '', name: '', phone: '', address: '', items: '' });
      await loadClients();
    } catch (e) { alert("Erro ao salvar cliente."); }
    finally { setIsProcessing(false); }
  };

  const startEdit = (c: Client) => {
    setClientData({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      items: (c.items || []).join(', ')
    });
    setEditMode(true);
    setIsModalOpen(true);
  };

  const filtered = (clients || []).filter(c => 
    (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.phone || '').includes(search)
  );

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Base de Clientes 360º</h2>
          <p className="text-slate-500 text-sm font-bold mt-1">Gestão centralizada com histórico de atendimentos e protocolos.</p>
        </div>
        <button onClick={() => { setEditMode(false); setClientData({id:'', name:'', phone:'', address:'', items:''}); setIsModalOpen(true); }} className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-700 transition-all">
          <UserPlus size={18} /> Novo Cliente
        </button>
      </header>

      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
         <Search className="text-slate-400 shrink-0" size={20} />
         <input 
          type="text" 
          placeholder="Pesquisar por nome ou telefone..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300"
         />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[75vh]">
        {/* LISTA DE CLIENTES */}
        <div className="lg:col-span-4 space-y-4 h-full flex flex-col">
           {isLoading ? (
             <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300">
                <Loader2 className="animate-spin" size={32} />
                <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Base...</p>
             </div>
           ) : filtered.length === 0 ? (
             <div className="flex-1 flex items-center justify-center text-slate-300 font-black uppercase tracking-widest text-[10px]">Nenhum cliente encontrado</div>
           ) : (
             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                {filtered.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => setSelectedClient(c)}
                    className={`w-full p-6 bg-white border-2 rounded-[32px] flex items-center justify-between group transition-all ${selectedClient?.id === c.id ? 'border-blue-600 shadow-xl shadow-blue-500/10' : 'border-slate-50 hover:border-slate-200 shadow-sm'}`}
                  >
                     <div className="text-left">
                        <h4 className="font-black text-slate-800 uppercase text-sm tracking-tight">{c.name}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.phone}</span>
                     </div>
                     <ChevronRight size={18} className={`transition-transform ${selectedClient?.id === c.id ? 'text-blue-600 translate-x-1' : 'text-slate-200'}`} />
                  </button>
                ))}
             </div>
           )}
        </div>

        {/* DETALHES E HISTÓRICO */}
        <div className="lg:col-span-8 h-full">
           {selectedClient ? (
             <div className="bg-white h-full rounded-[56px] shadow-sm border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
                <div className="p-8 md:p-10 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
                   <div className="space-y-4">
                      <div className="flex items-center gap-3">
                         <span className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">CLIENTE DREON</span>
                         <span className="text-slate-400 text-[9px] font-black tracking-widest uppercase">#{selectedClient.id.substring(0,8)}</span>
                      </div>
                      <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-tight uppercase">{selectedClient.name}</h3>
                      <div className="flex flex-wrap items-center gap-6">
                         <span className="flex items-center gap-2 text-sm font-black text-blue-600"><Phone size={16} /> {selectedClient.phone}</span>
                         <span className="flex items-start gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest max-w-xs"><MapPin size={16} className="shrink-0 text-red-500" /> {selectedClient.address || 'Sem endereço cadastrado'}</span>
                      </div>
                   </div>
                   <div className="flex flex-col items-center gap-2">
                      <div className="text-6xl drop-shadow-md">{SATISFACTION_EMOJIS[selectedClient.satisfaction] || '😐'}</div>
                      {isAdmin && (
                        <button onClick={() => startEdit(selectedClient)} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2">
                          <Edit2 size={12} /> Editar
                        </button>
                      )}
                   </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
                   {/* EQUIPAMENTOS */}
                   <section className="space-y-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><Tag size={14} className="text-indigo-500" /> Itens Instalados / Contratados</h5>
                      <div className="flex flex-wrap gap-2">
                         {selectedClient.items && selectedClient.items.length > 0 ? selectedClient.items.map((item, i) => (
                           <span key={i} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black uppercase border border-blue-100">{item}</span>
                         )) : (
                           <span className="text-xs font-bold text-slate-300 italic">Nenhum equipamento vinculado</span>
                         )}
                      </div>
                   </section>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* ÚLTIMAS LIGAÇÕES */}
                      <section className="space-y-4">
                         <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><History size={14} className="text-blue-500" /> Histórico de Ligações</h5>
                         {historyLoading ? (
                           <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-200" /></div>
                         ) : clientHistory.calls.length > 0 ? (
                           <div className="space-y-3">
                              {clientHistory.calls.slice(0, 5).map(call => (
                                <div key={call.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                   <div className="flex justify-between items-start">
                                      <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-slate-200 text-slate-600 rounded">{call.type}</span>
                                      <span className="text-[8px] font-black text-slate-400 uppercase">{new Date(call.startTime).toLocaleDateString()}</span>
                                   </div>
                                   <p className="text-xs font-bold text-slate-700 italic line-clamp-2">"{call.responses?.written_report || 'Sem resumo'}"</p>
                                   <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> {Math.floor(call.duration/60)}m {call.duration%60}s</span>
                                      <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">ID Operador: {call.operatorId.substring(0,6)}</span>
                                   </div>
                                </div>
                              ))}
                           </div>
                         ) : (
                           <p className="text-[10px] font-black uppercase text-slate-300 py-10 text-center tracking-widest">Nenhuma ligação registrada</p>
                         )}
                      </section>

                      {/* PROTOCOLOS DO CLIENTE */}
                      <section className="space-y-4">
                         <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><ClipboardList size={14} className="text-red-500" /> Protocolos Vinculados</h5>
                         {historyLoading ? (
                           <div className="flex justify-center p-8"><Loader2 className="animate-spin text-red-100" /></div>
                         ) : clientHistory.protocols.length > 0 ? (
                           <div className="space-y-3">
                              {clientHistory.protocols.map(proto => (
                                <div key={proto.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2">
                                   <div className="flex justify-between items-center">
                                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded text-white ${proto.status === ProtocolStatus.FECHADO ? 'bg-slate-500' : 'bg-red-600'}`}>
                                        {proto.status}
                                      </span>
                                      <span className="text-[9px] font-black text-slate-300 uppercase">#{proto.protocolNumber || proto.id.substring(0,8)}</span>
                                   </div>
                                   <h6 className="text-sm font-black text-slate-800 leading-tight">{proto.title}</h6>
                                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aberto em: {new Date(proto.openedAt).toLocaleDateString()}</p>
                                </div>
                              ))}
                           </div>
                         ) : (
                           <p className="text-[10px] font-black uppercase text-slate-300 py-10 text-center tracking-widest">Nenhum protocolo aberto</p>
                         )}
                      </section>
                   </div>
                </div>
             </div>
           ) : (
             <div className="h-full bg-slate-50 border-4 border-dashed border-slate-100 rounded-[56px] flex flex-col items-center justify-center p-20 text-center gap-6 opacity-40">
                <Users size={64} className="text-slate-300" />
                <p className="text-sm font-black uppercase text-slate-400 tracking-widest">Selecione um cliente para auditar o histórico completo</p>
             </div>
           )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                {editMode ? <Edit2 size={24} className="text-blue-400" /> : <UserPlus size={24} className="text-blue-400" />}
                {editMode ? 'Editar Cadastro' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-all"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSaveClient} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input type="text" required value={clientData.name} onChange={e => setClientData({...clientData, name: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                    <input type="text" required value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Itens (separados por vírgula)</label>
                    <input type="text" value={clientData.items} onChange={e => setClientData({...clientData, items: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" placeholder="Ex: Bomba, Filtro" />
                 </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço de Atendimento</label>
                <textarea value={clientData.address} onChange={e => setClientData({...clientData, address: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-24 resize-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
              </div>
              <button type="submit" disabled={isProcessing} className="w-full py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50">
                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />} {editMode ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
