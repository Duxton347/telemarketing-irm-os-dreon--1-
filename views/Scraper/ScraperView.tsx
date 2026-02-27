
import React, { useState } from 'react';
import {
    Database, Activity, CheckSquare, Search
} from 'lucide-react';
import { ProcessList } from './ProcessList';
import { RunExecution } from './RunExecution';
import { ResultsReview } from './ResultsReview';

export const ScraperView: React.FC<{ user: any }> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'PROCESSES' | 'RUNS' | 'REVIEW'>('PROCESSES');

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 animate-in fade-in duration-500 pb-24">
            <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Captação Digital <span className="text-blue-600">Maps</span></h1>
                    <p className="text-slate-500 font-medium mt-2">Automação de busca de leads geolocalizados.</p>
                </div>
            </header>

            {/* Navigation Tabs */}
            <div className="bg-white rounded-[24px] p-2 shadow-sm border border-slate-100 inline-flex mb-8 sticky top-4 z-50">
                <button
                    onClick={() => setActiveTab('PROCESSES')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'PROCESSES' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                >
                    <Database size={16} /> Processos
                </button>
                <button
                    onClick={() => setActiveTab('RUNS')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'RUNS' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                >
                    <Activity size={16} /> Execuções
                </button>
                <button
                    onClick={() => setActiveTab('REVIEW')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'REVIEW' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                >
                    <CheckSquare size={16} /> Revisão
                </button>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                {activeTab === 'PROCESSES' && <ProcessList user={user} />}
                {activeTab === 'RUNS' && <RunExecution />}
                {activeTab === 'REVIEW' && <ResultsReview user={user} />}
            </div>
        </div>
    );
};
