import React, { useState } from 'react';
import { X, Calendar, User, Phone, AlignLeft } from 'lucide-react';
import { dataService } from '../services/dataService';
import { User as UserType, CallType } from '../types';

interface Props {
    selectedIds: string[];
    operators: UserType[];
    user: UserType;
    onClose: () => void;
    onSuccess: () => void;
}

const BulkRescheduleModal: React.FC<Props> = ({ selectedIds, operators, user, onClose, onSuccess }) => {
    const [scheduledFor, setScheduledFor] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [callType, setCallType] = useState<CallType>(CallType.POS_VENDA);
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduledFor || !assignedTo) return alert('Preencha data e operador.');

        setLoading(true);
        try {
            const tasks = selectedIds.map(id => ({
                clientId: id,
                type: callType,
                assignedTo,
                status: 'pending',
                scheduledFor,
                scheduleReason: reason || 'Reprogramação em lote (Remarketing)'
            }));
            await dataService.bulkCreateTasks(tasks);
            onSuccess();
        } catch (error) {
            console.error(error);
            alert('Erro ao reprogramar.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">Reprogramar Contatos</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedIds.length} selecionados</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><Calendar size={14} /> Data Agendada</label>
                            <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none" required />
                        </div>

                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><User size={14} /> Operador Destino</label>
                            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none" required>
                                <option value="">Selecione um operador</option>
                                {operators.filter(o => o.role !== 'ADMIN').map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><Phone size={14} /> Tipo de Contato</label>
                            <select value={callType} onChange={e => setCallType(e.target.value as CallType)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none">
                                {Object.values(CallType).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><AlignLeft size={14} /> Motivo (Opcional)</label>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Ex: Tentar contato pelo WhatsApp..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none resize-none" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                            {loading ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BulkRescheduleModal;
