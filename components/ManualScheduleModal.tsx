
import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Phone, Search, Loader2, Save, Plus } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Client, CallType, User as AppUser, UserRole } from '../types';
import { normalizePhone } from '../lib/supabase';
import { getTaskAssignableUsers } from '../utils/taskAssignment';

interface ManualScheduleModalProps {
    onClose: () => void;
    onSuccess: () => void;
    user: AppUser;
}

export const ManualScheduleModal: React.FC<ManualScheduleModalProps> = ({ onClose, onSuccess, user }) => {
    const [step, setStep] = useState<'client' | 'schedule'>('client');
    const [loading, setLoading] = useState(false);

    // Client Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isNewClient, setIsNewClient] = useState(false);
    const [newClientForm, setNewClientForm] = useState({ name: '', phone: '' });

    // Schedule State
    const [scheduleForm, setScheduleForm] = useState({
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        operatorId: '',
        type: CallType.POS_VENDA,
        reason: ''
    });

    const [operators, setOperators] = useState<AppUser[]>([]);

    useEffect(() => {
        // Load Operators
        dataService.getUsers().then(users => {
            const assignableUsers = getTaskAssignableUsers(users);
            setOperators(assignableUsers);
            setScheduleForm(prev => ({
                ...prev,
                operatorId: prev.operatorId || assignableUsers.find(operator => operator.id === user.id)?.id || assignableUsers[0]?.id || ''
            }));
        });
    }, [user.id]);

    useEffect(() => {
        // Debounced search
        const timeout = setTimeout(async () => {
            if (searchTerm.length < 3) {
                setSearchResults([]);
                return;
            }
            try {
                const allClients = await dataService.getClients(true); // Include LEADs in manual scheduling search
                const lowerTerm = searchTerm.toLowerCase();
                const filtered = allClients.filter(c =>
                    c.name.toLowerCase().includes(lowerTerm) ||
                    c.phone.includes(searchTerm) ||
                    (c.phone_secondary || '').includes(searchTerm)
                ).slice(0, 5);
                setSearchResults(filtered);
            } catch (error) {
                console.error(error);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    const handleClientSelect = (client: Client) => {
        setSelectedClient(client);
        setSearchTerm(client.name);
        setSearchResults([]);
        setStep('schedule');
    };

    const handleNewClientSubmit = () => {
        if (!newClientForm.name || !newClientForm.phone) return alert("Preencha nome e telefone");
        setSelectedClient({ id: '', ...newClientForm } as Client); // Temporary object
        setIsNewClient(true);
        setStep('schedule');
    };

    const handleScheduleSubmit = async () => {
        if (!scheduleForm.date || !scheduleForm.time || !scheduleForm.operatorId) return alert("Preencha todos os campos obrigatórios");
        if (!selectedClient && !isNewClient) return alert("Selecione um cliente");

        setLoading(true);
        try {
            let clientId = selectedClient?.id;

            // 1. Upsert Client if new or selected (updates interaction time)
            const clientData = await dataService.upsertClient({
                name: selectedClient?.name || newClientForm.name,
                phone: selectedClient?.phone || newClientForm.phone,
                // If new client, ID is empty, upsert handles it by phone
            });
            clientId = clientData.id;

            // 2. Create Schedule
            await dataService.createScheduleRequest({
                customerId: clientId,
                requestedByOperatorId: user.id,
                assignedOperatorId: scheduleForm.operatorId,
                scheduledFor: `${scheduleForm.date}T${scheduleForm.time}:00`,
                callType: scheduleForm.type,
                status: 'PENDENTE_APROVACAO', // Force approval workflow
                scheduleReason: scheduleForm.reason || 'Agendamento Manual'
            });

            onSuccess();
            onClose();
            alert("Agendamento criado com sucesso!");
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao criar agendamento: ${error.message || JSON.stringify(error)}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                <header className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Novo Agendamento</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </header>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {step === 'client' ? (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Buscar Cliente ou Lead</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20"
                                        placeholder="Nome, telefone ou lead..."
                                        value={searchTerm}
                                        onChange={e => {
                                            setSearchTerm(e.target.value);
                                            if (selectedClient) {
                                                setSelectedClient(null);
                                                setIsNewClient(false);
                                            }
                                        }}
                                    />
                                </div>
                                {searchResults.length > 0 && (
                                    <div className="mt-2 bg-white border border-slate-100 rounded-xl shadow-lg divide-y divide-slate-50 overflow-hidden">
                                        {searchResults.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => handleClientSelect(c)}
                                                className="w-full text-left p-3 hover:bg-orange-50 transition-colors flex items-center justify-between group"
                                            >
                                                <span className="font-bold text-slate-700 group-hover:text-orange-700">{c.name}</span>
                                                <span className="text-xs text-slate-400">{c.phone}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="relative flex items-center gap-4">
                                <div className="h-px bg-slate-100 flex-1" />
                                <span className="text-xs font-bold text-slate-300 uppercase">Ou</span>
                                <div className="h-px bg-slate-100 flex-1" />
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="font-black text-slate-700 uppercase tracking-wide text-sm mb-4 flex items-center gap-2">
                                    <Plus size={16} className="text-orange-500" /> Novo Cliente
                                </h4>
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        placeholder="Nome Completo"
                                        className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-orange-500 transition-colors"
                                        value={newClientForm.name}
                                        onChange={e => setNewClientForm({ ...newClientForm, name: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Telefone (WhatsApp)"
                                        className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-orange-500 transition-colors"
                                        value={newClientForm.phone}
                                        onChange={e => setNewClientForm({ ...newClientForm, phone: normalizePhone(e.target.value) })}
                                    />
                                    <button
                                        onClick={handleNewClientSubmit}
                                        disabled={!newClientForm.name || !newClientForm.phone}
                                        className="w-full py-3 bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-orange-600 transition-colors disabled:opacity-50"
                                    >
                                        Continuar com Novo Cliente
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-orange-50 p-4 rounded-xl flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-1">Cliente Selecionado</p>
                                    <h4 className="font-black text-slate-800">{selectedClient?.name}</h4>
                                </div>
                                <button onClick={() => setStep('client')} className="p-2 hover:bg-orange-100 rounded-lg text-orange-600 transition-colors">
                                    <User size={18} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Data</label>
                                    <input
                                        type="date"
                                        className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20"
                                        value={scheduleForm.date}
                                        onChange={e => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Horário</label>
                                    <input
                                        type="time"
                                        className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20"
                                        value={scheduleForm.time}
                                        onChange={e => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tipo de Chamada</label>
                                <select
                                    className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none"
                                    value={scheduleForm.type}
                                    onChange={e => setScheduleForm({ ...scheduleForm, type: e.target.value as CallType })}
                                >
                                    {Object.values(CallType)
                                        .filter(t => t !== CallType.WHATSAPP)
                                        .map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Atribuir para</label>
                                <select
                                    className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none"
                                    value={scheduleForm.operatorId}
                                    onChange={e => setScheduleForm({ ...scheduleForm, operatorId: e.target.value })}
                                >
                                    <option value="">Selecione um operador...</option>
                                    {operators.map(op => (
                                        <option key={op.id} value={op.id}>{op.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Motivo / Observação</label>
                                <textarea
                                    className="w-full p-3 bg-slate-50 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20 min-h-[100px] resize-none"
                                    placeholder="Descreva o motivo do agendamento..."
                                    value={scheduleForm.reason}
                                    onChange={e => setScheduleForm({ ...scheduleForm, reason: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <footer className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-4">
                    {step === 'schedule' && (
                        <>
                            <button
                                onClick={() => setStep('client')}
                                className="px-6 py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-200 uppercase text-xs tracking-widest transition-colors"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={handleScheduleSubmit}
                                disabled={loading}
                                className="px-8 py-4 bg-orange-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-orange-600/20 active:scale-95 transition-all flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                                Confirmar Agendamento
                            </button>
                        </>
                    )}
                </footer>
            </div>
        </div>
    );
};
