import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Question, CallType } from '../types';

interface QuestionnaireFormProps {
    questions: Question[];
    responses: Record<string, any>;
    onResponseChange: (questionId: string, value: any) => void;
    type: CallType;
    readOnly?: boolean;
}

export const QuestionnaireForm: React.FC<QuestionnaireFormProps> = ({
    questions,
    responses,
    onResponseChange,
    type,
    readOnly = false
}) => {
    const filteredQuestions = questions.filter(q => q.type === type || q.type === 'ALL');

    return (
        <section className="space-y-6">
            <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                <CheckCircle2 size={18} className="text-blue-600" /> Questionário Obrigatório
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredQuestions.map(q => (
                    <div key={q.id} className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 space-y-4">
                        <p className="font-black text-slate-800 text-sm leading-tight">{q.order}. {q.text}</p>
                        <div className="flex flex-wrap gap-2">
                            {q.options.map(opt => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => !readOnly && onResponseChange(q.id, opt)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${responses[q.id] === opt ? 'bg-slate-900 text-white shadow-xl' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'} ${readOnly ? 'cursor-default' : ''}`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};
