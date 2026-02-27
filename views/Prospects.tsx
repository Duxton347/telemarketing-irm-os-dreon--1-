import React, { useState, useEffect } from 'react';
import {
    Search, Filter, Plus, Phone, MessageCircle, Calendar,
    MoreHorizontal, ChevronRight, UserPlus, FileText, CheckCircle2,
    MapPin, Globe, Mail, DollarSign, Clock
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Client, User, UserRole } from '../types';

const FUNNEL_STAGES = [
    { id: 'NEW', label: 'Novo Lead', color: 'bg-blue-100 text-blue-700' },
    { id: 'CONTACT_ATTEMPT', label: 'Tentativa', color: 'bg-yellow-100 text-yellow-700' },
    { id: 'CONTACT_MADE', label: 'Contato Feito', color: 'bg-orange-100 text-orange-700' },
    { id: 'QUALIFIED', label: 'Qualificado', color: 'bg-purple-100 text-purple-700' },
    { id: 'PROPOSAL_SENT', label: 'Proposta', color: 'bg-indigo-100 text-indigo-700' },
    { id: 'PHYSICAL_VISIT', label: 'Visita Física', color: 'bg-pink-100 text-pink-700' }
];

const Prospects: React.FC = () => {
    const [prospects, setProspects] = useState<Client[]>([]);
    const [filteredProspects, setFilteredProspects] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStage, setSelectedStage] = useState<string>('ALL');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProspect, setNewProspect] = useState<Partial<Client>>({});

    useEffect(() => {
        loadProspects();
    }, []);

    useEffect(() => {
        filterProspects();
    }, [searchTerm, selectedStage, prospects]);

    const loadProspects = async () => {
        setLoading(true);
        try {
            const data = await dataService.getProspects();
            setProspects(data);
        } catch (error) {
            console.error("Error loading prospects:", error);
        } finally {
            setLoading(false);
        }
    };

    const filterProspects = () => {
        let filtered = prospects;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(lower) ||
                p.phone.includes(lower) ||
                p.buyer_name?.toLowerCase().includes(lower)
            );
        }

        if (selectedStage !== 'ALL') {
            filtered = filtered.filter(p => (p.funnel_status || 'NEW') === selectedStage);
        }

        setFilteredProspects(filtered);
    };

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            await dataService.upsertClient({
                phone: prospects.find(p => p.id === id)?.phone, // Needed for upsert key
                funnel_status: newStatus as any
            });

            // Optimistic update
            setProspects(prev => prev.map(p =>
                p.id === id ? { ...p, funnel_status: newStatus as any } : p
            ));
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar status");
        }
    };

    const handleSaveProspect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProspect.name || !newProspect.phone) return alert("Nome e Telefone obrigatórios");

        try {
            await dataService.upsertClient({
                ...newProspect,
                status: 'LEAD',
                funnel_status: 'NEW',
                origin: 'MANUAL'
            });
            setIsModalOpen(false);
            setNewProspect({});
            loadProspects();
            alert("Prospecto cadastrado!");
        } catch (e) {
            alert("Erro ao salvar prospecto");
        }
    };

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Gestão de Leads</h2>
                    <p className="text-slate-500 text-sm font-medium">Pipeline de prospecção e qualificação.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                    <Plus size={16} /> Novo Lead
                </button>
            </header>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nome, telefone ou comprador..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-sm"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    <button
                        onClick={() => setSelectedStage('ALL')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border ${selectedStage === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                    >
                        Todos
                    </button>
                    {FUNNEL_STAGES.map(stage => (
                        <button
                            key={stage.id}
                            onClick={() => setSelectedStage(stage.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border ${selectedStage === stage.id ? stage.color + ' border-transparent ring-2 ring-offset-2 ring-slate-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                        >
                            {stage.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Kanban / Grid View */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Carregando...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredProspects.map(prospect => (
                        <div key={prospect.id} className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${FUNNEL_STAGES.find(s => s.id === (prospect.funnel_status || 'NEW'))?.color || 'bg-slate-100 text-slate-500'}`}>
                                    {FUNNEL_STAGES.find(s => s.id === (prospect.funnel_status || 'NEW'))?.label}
                                </span>
                                <div className="flex gap-1">
                                    {/* Action Buttons */}
                                    {prospect.website && (
                                        <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg" title="Website"><Globe size={14} /></a>
                                    )}
                                </div>
                            </div>

                            <h3 className="font-extrabold text-slate-800 text-lg leading-tight mb-1">{prospect.name}</h3>
                            {prospect.buyer_name && <p className="text-xs font-bold text-slate-500 mb-2">Comprador: {prospect.buyer_name}</p>}

                            <div className="space-y-2 mb-6">
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                    <Phone size={12} className="text-slate-300" /> {prospect.phone}
                                </div>
                                {prospect.email && (
                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                        <Mail size={12} className="text-slate-300" /> {prospect.email}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                    <MapPin size={12} className="text-slate-300" /> {prospect.address || 'Sem endereço'}
                                </div>
                                {prospect.interest_product && (
                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                        <CheckCircle2 size={12} className="text-slate-300" /> Interesse: {prospect.interest_product}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                                <select
                                    className="bg-slate-50 border-none text-[10px] font-black uppercase tracking-widest text-slate-600 rounded-lg py-2 pl-2 pr-8 outline-none cursor-pointer hover:bg-slate-100"
                                    value={prospect.funnel_status || 'NEW'}
                                    onChange={(e) => handleUpdateStatus(prospect.id, e.target.value)}
                                >
                                    {FUNNEL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>

                                <div className="flex gap-2">
                                    {/* Quick Actions */}
                                    <button className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all" title="WhatsApp">
                                        <MessageCircle size={16} />
                                    </button>
                                    <button className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all" title="Ligar">
                                        <Phone size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* New Prospect Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <h3 className="text-2xl font-black text-slate-800 mb-6">Novo Prospecto</h3>
                        <form onSubmit={handleSaveProspect} className="space-y-4">
                            <input type="text" placeholder="Nome da Empresa/Cliente" className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold text-sm" value={newProspect.name || ''} onChange={e => setNewProspect({ ...newProspect, name: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Telefone" className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold text-sm" value={newProspect.phone || ''} onChange={e => setNewProspect({ ...newProspect, phone: e.target.value })} />
                                <input type="text" placeholder="Comprador" className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold text-sm" value={newProspect.buyer_name || ''} onChange={e => setNewProspect({ ...newProspect, buyer_name: e.target.value })} />
                            </div>
                            <input type="text" placeholder="Produto de Interesse" className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold text-sm" value={newProspect.interest_product || ''} onChange={e => setNewProspect({ ...newProspect, interest_product: e.target.value })} />
                            <input type="text" placeholder="Endereço (opcional)" className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold text-sm" value={newProspect.address || ''} onChange={e => setNewProspect({ ...newProspect, address: e.target.value })} />

                            <div className="flex justify-end gap-2 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase">Cancelar</button>
                                <button type="submit" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-blue-500/30">Salvar Lead</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Prospects;
