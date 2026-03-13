import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Question, CallType } from '../types';

interface QuestionnaireFormProps {
    questions: Question[];
    responses: Record<string, any>;
    onResponseChange: (questionId: string, value: any) => void;
    type: CallType;
    proposito?: string | null;
    readOnly?: boolean;
}

export const QuestionnaireForm: React.FC<QuestionnaireFormProps> = ({
    questions,
    responses,
    onResponseChange,
    type,
    proposito,
    readOnly = false
}) => {
    const filteredQuestions = questions.filter(q => {
        const matchesType = q.type === type || q.type === 'ALL';
        if (!matchesType) return false;
        
        // Se a pergunta tem um propósito específico, só exibe se a task atual também tiver esse mesmo propósito
        if (q.proposito) {
            return q.proposito === proposito;
        }
        
        // Se a pergunta não tem propósito, exibe genéricamente para aquele tipo de chamada
        return true;
    });

    const renderQuestionInput = (q: Question) => {
        const key = q.campo_resposta || q.id;
        
        // Check for special option types
        const hasTextInput = q.tipo_input === 'text' || q.options.some(o => o === '__TEXT__');
        const hasTextArea = q.options.some(o => o === '__TEXTAREA__');
        const dropdownOption = q.options.find(o => o.startsWith('__DROPDOWN__:'));
        const regularOptions = q.options.filter(o => !o.startsWith('__'));

        // Dropdown with predefined options
        if (dropdownOption) {
            const choices = dropdownOption.replace('__DROPDOWN__:', '').split(',').map(s => s.trim());
            return (
                <div className="space-y-3">
                    <select
                        value={responses[key] || ''}
                        onChange={e => !readOnly && onResponseChange(key, e.target.value)}
                        disabled={readOnly}
                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                    >
                        <option value="">Selecione...</option>
                        {choices.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {/* Allow custom input if "Outros" is selected */}
                    {responses[key] === 'Outros' && (
                        <input
                            type="text"
                            value={responses[`${key}_note`] || ''}
                            onChange={e => !readOnly && onResponseChange(`${key}_note`, e.target.value)}
                            placeholder="Especifique..."
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                        />
                    )}
                </div>
            );
        }

        // Free text input
        if (hasTextInput) {
            return (
                <div className="space-y-3">
                    {regularOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {regularOptions.map(opt => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => !readOnly && onResponseChange(key, opt)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${responses[key] === opt ? 'bg-slate-900 text-white shadow-xl' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'} ${readOnly ? 'cursor-default' : ''}`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}
                    <input
                        type="text"
                        value={typeof responses[key] === 'string' && !regularOptions.includes(responses[key]) ? responses[key] : (responses[`${key}_note`] || '')}
                        onChange={e => {
                            if (!readOnly) {
                                if (regularOptions.length > 0) {
                                    onResponseChange(`${key}_note`, e.target.value);
                                } else {
                                    onResponseChange(key, e.target.value);
                                }
                            }
                        }}
                        placeholder="Digite aqui..."
                        disabled={readOnly}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                </div>
            );
        }

        // Textarea
        if (hasTextArea) {
            return (
                <textarea
                    value={responses[key] || ''}
                    onChange={e => !readOnly && onResponseChange(key, e.target.value)}
                    placeholder="Digite aqui..."
                    disabled={readOnly}
                    rows={3}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none resize-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
            );
        }

        // Default: button options (existing behavior)
        return (
            <div className="flex flex-wrap gap-2">
                {q.options.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => !readOnly && onResponseChange(key, opt)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${responses[key] === opt ? 'bg-slate-900 text-white shadow-xl' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'} ${readOnly ? 'cursor-default' : ''}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <section className="space-y-6">
            <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                <CheckCircle2 size={18} className="text-blue-600" /> Questionário Obrigatório
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredQuestions.map(q => (
                    <div key={q.id} className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 space-y-4">
                        <p className="font-black text-slate-800 text-sm leading-tight">{q.order || q.text.split('.')[0] + '.'} {q.text}</p>
                        {renderQuestionInput(q)}
                    </div>
                ))}
            </div>
        </section>
    );
};
