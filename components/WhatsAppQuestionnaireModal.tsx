import React, { useEffect, useState } from 'react';
import { X, Save, MessageSquare, Loader2 } from 'lucide-react';
import { QuestionnaireForm } from './QuestionnaireForm';
import { dataService } from '../services/dataService';
import { WhatsAppTask, Question, Client } from '../types';
import { buildQuestionnaireTextSummary, enrichQuestionnaireResponses } from '../utils/questionnaireInsights';

interface WhatsAppQuestionnaireModalProps {
    task: WhatsAppTask;
    onClose: () => void;
    onComplete: (responses: any) => void;
}

const hasMeaningfulValue = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
};

export const WhatsAppQuestionnaireModal: React.FC<WhatsAppQuestionnaireModalProps> = ({ task, onClose, onComplete }) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [responses, setResponses] = useState<Record<string, any>>({});
    const [clientContext, setClientContext] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const loadedClient = await dataService.getClientById(task.clientId).catch(() => null);
                setClientContext(loadedClient);
                const loadedQuestions = await dataService.getQuestions(
                    task.type,
                    task.proposito || undefined,
                    { clientContext: loadedClient || undefined }
                );
                setQuestions(loadedQuestions);
                setResponses(task.responses || {});
            } catch (error) {
                console.error('Error loading questions:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [task.id, task.proposito, task.responses, task.type]);

    const handleSave = async () => {
        const normalizedBaseResponses = enrichQuestionnaireResponses(
            {
                ...responses,
                call_type: task.type,
                call_purpose: task.proposito
            },
            questions,
            task.type,
            task.proposito,
            { clientContext: clientContext || undefined, responses }
        );

        const questionnaireTextSummary = buildQuestionnaireTextSummary(
            normalizedBaseResponses,
            questions,
            task.type,
            task.proposito
        );

        const hasQuestionnaireAnswers = questions.some(question => {
            const key = question.campo_resposta || question.id;
            return hasMeaningfulValue(normalizedBaseResponses[key]);
        });

        const manualReport = String(responses.written_report || '').trim();
        if (!hasQuestionnaireAnswers && !manualReport) {
            alert('Preencha ao menos uma resposta do questionario ou informe um resumo do atendimento.');
            return;
        }

        if (!confirm('Confirmar finalizacao do atendimento?')) return;

        setSaving(true);

        const finalWrittenReport = manualReport || questionnaireTextSummary || '';
        onComplete({
            ...normalizedBaseResponses,
            written_report: finalWrittenReport || undefined,
            questionnaire_text_summary: questionnaireTextSummary || undefined
        });
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
                            <p className="text-xs font-bold text-slate-400 mt-1">{task.type}{task.proposito ? ` | ${task.proposito}` : ''}</p>
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
                            <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Preenchimento assinado pelo operador</p>
                                <p className="text-sm font-bold text-blue-900 mt-2">
                                    Registre as respostas recebidas pelo cliente no WhatsApp. Se nao houver texto livre, o sistema monta um resumo automatico com base nas respostas.
                                </p>
                            </div>

                            <QuestionnaireForm
            questions={questions}
            responses={responses}
            onResponseChange={(qId, val) => setResponses(prev => ({ ...prev, [qId]: val }))}
            type={task.type}
            proposito={task.proposito}
            clientContext={clientContext || undefined}
        />

                            <div className="space-y-4 pt-6 border-t border-slate-200">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <MessageSquare size={14} /> Resumo do Operador
                                </label>
                                <textarea
                                    value={responses.written_report || ''}
                                    onChange={e => setResponses(prev => ({ ...prev, written_report: e.target.value }))}
                                    placeholder="Opcional: descreva contexto, prazo prometido ou observacoes complementares."
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
