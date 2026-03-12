
import React, { useState, useEffect } from 'react';
import { X, Save, MessageSquare, Loader2 } from 'lucide-react';
import { QuestionnaireForm } from './QuestionnaireForm';
import { dataService } from '../services/dataService';
import { WhatsAppTask, Question } from '../types';

interface WhatsAppQuestionnaireModalProps {
    task: WhatsAppTask;
    onClose: () => void;
    onComplete: (responses: any) => void;
}

export const WhatsAppQuestionnaireModal: React.FC<WhatsAppQuestionnaireModalProps> = ({ task, onClose, onComplete }) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [responses, setResponses] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const allQuestions = await dataService.getQuestions();
                setQuestions(allQuestions);
            } catch (error) {
                console.error("Error loading questions:", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const handleSave = async () => {
        if (!responses['written_report'] || !responses['written_report'].trim()) {
            alert("O Relatório Escrito do Operador é obrigatório.");
            return;
        }

        if (!confirm("Confirmar finalização do atendimento?")) return;

        setSaving(true);
        // Pass responses back to parent to handle saving (or save here if preferred, but parent has the logic in my previous thought)
        // Actually, looking at the Dashboard code I planned, the Dashboard handles the saving via dataService.completeWhatsAppTask
        onComplete(responses);
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
                <header className="bg-slate-900 p-8 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4 text-white">
                        <div className="p-3 bg-green-600 rounded-xl">
                            <MessageSquare size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Finalizando Atendimento</p>
                            <h3 className="text-xl font-black uppercase tracking-tighter">{task.clientName}</h3>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={28} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-slate-50">
                    {loading ? (
                        <div className="flex justify-center p-10"><Loader2 className="animate-spin text-slate-400" /></div>
                    ) : (
                        <div className="space-y-8">
                            <QuestionnaireForm
                                questions={questions}
                                responses={responses}
                                onResponseChange={(qId, val) => setResponses(prev => ({ ...prev, [qId]: val }))}
                                type={task.type}
                                proposito={(task as any).proposito}
                            />

                            <div className="space-y-4 pt-6 border-t border-slate-200">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <MessageSquare size={14} /> Relatório Escrito do Operador <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={responses['written_report'] || ''}
                                    onChange={e => setResponses(prev => ({ ...prev, written_report: e.target.value }))}
                                    placeholder="Descreva os detalhes do atendimento..."
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-green-500/10 transition-all font-medium text-slate-700 min-h-[120px] resize-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <footer className="p-8 border-t border-slate-100 bg-white flex justify-end gap-4 shrink-0">
                    <button onClick={onClose} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-12 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-green-600/20 active:scale-95 transition-all flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />} Finalizar Atendimento
                    </button>
                </footer>
            </div>
        </div>
    );
};
