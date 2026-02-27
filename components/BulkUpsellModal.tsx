import React, { useState } from 'react';
import { X, Tag, AlignLeft } from 'lucide-react';
import { dataService } from '../services/dataService';
import { User as UserType } from '../types';

interface Props {
    selectedIds: string[];
    user: UserType;
    onClose: () => void;
    onSuccess: () => void;
}

const BulkUpsellModal: React.FC<Props> = ({ selectedIds, user, onClose, onSuccess }) => {
    const [offer, setOffer] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const predefinedOffers = [
        'QUÍMICOS',
        'BOMBAS',
        'BOILER',
        'AQUECEDOR PISCINA',
        'FOTOVOLTAICO',
        'LINHA BANHO',
        'OUTROS'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!offer) return alert('Selecione uma oferta.');

        setLoading(true);
        try {
            await dataService.bulkUpdateUpsell(selectedIds, offer, notes, user.id);
            onSuccess();
        } catch (error) {
            console.error(error);
            alert('Erro ao marcar upsell.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50 rounded-t-[32px]">
                    <div>
                        <h3 className="text-xl font-black text-amber-800 tracking-tight flex items-center gap-2"><Tag size={20} /> Marcar Upsell</h3>
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">{selectedIds.length} selecionados</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-amber-100 rounded-full transition-colors"><X size={20} className="text-amber-700" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><Tag size={14} /> O Que Oferecer</label>
                            <select value={offer} onChange={e => setOffer(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none" required>
                                <option value="">Selecione um produto/serviço</option>
                                {predefinedOffers.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><AlignLeft size={14} /> Observação (Opcional)</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Condição especial, detalhes..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none resize-none" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
                            {loading ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BulkUpsellModal;
