import React from 'react';
import { X, Calendar, Clock, MessageCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { CallType } from '../types';

interface RepiqueModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: RepiqueData) => Promise<void>;
    isProcessing: boolean;
    selectedCount?: number; // For bulk actions
    initialData?: Partial<RepiqueData>;
}

export interface RepiqueData {
    date: string;
    time: string;
    reason: string;
    contactType: 'whatsapp' | 'call'; // Logic for "Só WhatsApp" vs "Ligar"
    shouldRemoveFromQueue: boolean; // For "Remover da Fila" option
}

export const RepiqueModal: React.FC<RepiqueModalProps> = ({
    isOpen, onClose, onConfirm, isProcessing, selectedCount = 1, initialData
}) => {
    const [formData, setFormData] = React.useState<RepiqueData>({
        date: initialData?.date || new Date().toISOString().split('T')[0],
        time: initialData?.time || '09:00',
        reason: initialData?.reason || '',
        contactType: initialData?.contactType || 'call',
        shouldRemoveFromQueue: initialData?.shouldRemoveFromQueue || false,
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onConfirm(formData);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <Calendar className="text-orange-500" size={20} />
                            Solicitar Repique
                        </h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {selectedCount > 1 ? `Reagendar ${selectedCount} tarefas selecionadas` : 'Reagendar tarefa atual'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 text-slate-400" size={16} />
                                <input
                                    type="date"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                                    value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-3 text-slate-400" size={16} />
                                <input
                                    type="time"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                                    value={formData.time}
                                    onChange={e => setFormData({ ...formData, time: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Action Type */}
                    <div className="bg-slate-50 p-4 rounded-2xl flex gap-2">
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, contactType: 'call' })}
                            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.contactType === 'call' ? 'bg-white shadow-md text-orange-600' : 'text-slate-400 hover:bg-white/50'}`}
                        >
                            <Clock size={14} /> Agendar Retorno
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, contactType: 'whatsapp' })}
                            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.contactType === 'whatsapp' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400 hover:bg-white/50'}`}
                        >
                            <MessageCircle size={14} /> Só WhatsApp
                        </button>
                    </div>

                    {/* Reason */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo</label>
                        <textarea
                            required
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none transition-all resize-none h-24"
                            placeholder="Descreva o motivo do reagendamento..."
                            value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                        />
                    </div>

                    {/* Alert Message */}
                    <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex gap-3 text-orange-700">
                        <AlertTriangle className="shrink-0" size={20} />
                        <p className="text-xs font-medium leading-relaxed">
                            O agendamento ficará pendente de aprovação do supervisor.
                            {formData.contactType === 'whatsapp' && " A tarefa será removida da fila atual e registrada apenas como contato digital."}
                        </p>
                    </div>

                </form>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-200 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isProcessing}
                        className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Confirmar Repique
                    </button>
                </div>

            </div>
        </div>
    );
};
