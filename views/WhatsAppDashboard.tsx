
import React, { useState, useEffect } from 'react';
import {
    MessageSquare, User, Phone, Calendar, Clock, CheckCircle,
    XCircle, AlertCircle, Copy, ExternalLink, Filter, Search,
    Play, SkipForward, ClipboardList
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { WhatsAppTask, User as AppUser, UserRole } from '../types';
import { normalizePhone } from '../lib/supabase';
import { WhatsAppQuestionnaireModal } from '../components/WhatsAppQuestionnaireModal';
import { getTaskAssignableUsers } from '../utils/taskAssignment';

interface WhatsAppDashboardProps {
    user: AppUser;
}

const buildLocalDateKey = (value?: string) => {
    if (!value) return '';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const matchesDateRange = (value: string | undefined, start: string, end: string) => {
    if (!start && !end) return true;

    const dateKey = buildLocalDateKey(value);
    if (!dateKey) return false;
    if (start && dateKey < start) return false;
    if (end && dateKey > end) return false;
    return true;
};

const WhatsAppDashboard: React.FC<WhatsAppDashboardProps> = ({ user }) => {
    const [tasks, setTasks] = useState<WhatsAppTask[]>([]);
    const [effectiveOperatorId, setEffectiveOperatorId] = useState<string>(user.id);
    const [operators, setOperators] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'queue' | 'pending' | 'history'>('queue');
    const [searchTerm, setSearchTerm] = useState('');
    const [questionnaireDateFrom, setQuestionnaireDateFrom] = useState('');
    const [questionnaireDateTo, setQuestionnaireDateTo] = useState('');

    // Modals state
    const [skipModalOpen, setSkipModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<WhatsAppTask | null>(null);
    const [skipReason, setSkipReason] = useState('');
    const [skipNote, setSkipNote] = useState('');

    const [questionnaireModalOpen, setQuestionnaireModalOpen] = useState(false);
    const [taskToComplete, setTaskToComplete] = useState<WhatsAppTask | null>(null);

    useEffect(() => {
        if (user.role !== UserRole.ADMIN) {
            setOperators([]);
            return;
        }

        dataService.getUsers()
            .then(users => {
                setOperators(
                    getTaskAssignableUsers(users).filter(operator => operator.id !== user.id)
                );
            })
            .catch(error => console.error('Error fetching assignable users:', error));
    }, [user.id, user.role]);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const operatorFilter = user.role === UserRole.ADMIN
                ? effectiveOperatorId
                : (user.role === UserRole.SUPERVISOR ? undefined : user.id);

            const data = await dataService.getWhatsAppTasks(operatorFilter);
            setTasks(data);
        } catch (error) {
            console.error("Error fetching WhatsApp tasks:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [effectiveOperatorId, user.id, user.role]);

    const handleStart = async (task: WhatsAppTask) => {
        if (!confirm('Iniciar atendimento via WhatsApp? O cliente irá para a aba "Pendentes de Questionário".')) return;
        try {
            await dataService.startWhatsAppTask(task.id, user.id);
            fetchTasks();
        } catch (error) {
            alert('Erro ao iniciar tarefa.');
        }
    };

    const handleSkip = async () => {
        if (!selectedTask || !skipReason) return;
        try {
            await dataService.skipWhatsAppTask(selectedTask.id, user.id, skipReason, skipNote);
            setSkipModalOpen(false);
            setSelectedTask(null);
            setSkipReason('');
            setSkipNote('');
            fetchTasks();
        } catch (error) {
            alert('Erro ao pular tarefa.');
        }
    };

    const openSkipModal = (task: WhatsAppTask) => {
        setSelectedTask(task);
        setSkipModalOpen(true);
    };

    const openWhatsApp = (phone: string) => {
        const cleanPhone = normalizePhone(phone);
        if (cleanPhone) {
            window.open(`https://wa.me/55${cleanPhone}`, '_blank');
        } else {
            alert('Número inválido');
        }
    };

    const handleOpenQuestionnaire = (task: WhatsAppTask) => {
        setTaskToComplete(task);
        setQuestionnaireModalOpen(true);
    };

    const handleCompleteTask = async (responses: any) => {
        if (!taskToComplete) return;
        try {
            await dataService.completeWhatsAppTask(taskToComplete.id, user.id, responses);
            setQuestionnaireModalOpen(false);
            setTaskToComplete(null);
            fetchTasks();
        } catch (error) {
            alert('Erro ao completar tarefa.');
        }
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = (t.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.clientPhone?.includes(searchTerm));
        const questionnaireContactDate = t.startedAt || t.createdAt;
        const matchesQuestionnaireDate = activeTab !== 'pending'
            || matchesDateRange(questionnaireContactDate, questionnaireDateFrom, questionnaireDateTo);

        if (activeTab === 'queue') return t.status === 'pending' && matchesSearch;
        if (activeTab === 'pending') return t.status === 'started' && matchesSearch && matchesQuestionnaireDate;
        if (activeTab === 'history') return (t.status === 'completed' || t.status === 'skipped') && matchesSearch;
        return false;
    });

    // Calculate counters
    const counts = {
        queue: tasks.filter(t => t.status === 'pending').length,
        pending: tasks.filter(t => t.status === 'started').length,
        history: tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12">
            <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <MessageSquare className="text-green-600" size={32} />
                        Central WhatsApp
                    </h1>
                    <p className="text-slate-500 font-medium">Gerencie suas comunicações digitais</p>
                </div>
            </header>

            {user.role === UserRole.ADMIN && (
                <div className="mb-8 bg-white rounded-[28px] border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                        <User size={22} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Visualizar Atendimento por Usuário</p>
                        <select
                            value={effectiveOperatorId}
                            onChange={e => setEffectiveOperatorId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                            <option value={user.id}>Eu mesmo (Admin)</option>
                            {operators.map(operator => (
                                <option key={operator.id} value={operator.id}>{operator.name} (@{operator.username})</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-8 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('queue')}
                    className={`pb-4 px-4 font-bold text-sm uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'queue' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Fila de Atendimento
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{counts.queue}</span>
                </button>
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`pb-4 px-4 font-bold text-sm uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'text-amber-600 border-b-4 border-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Pendentes Questionário
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{counts.pending}</span>
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-4 px-4 font-bold text-sm uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'history' ? 'text-emerald-600 border-b-4 border-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Histórico
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{counts.history}</span>
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden min-h-[500px]">
                {loading ? (
                    <div className="p-20 text-center text-slate-400">Carregando...</div>
                ) : (
                    <div>
                        {/* Toolbar */}
                        <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center gap-4">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente ou telefone..."
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>

                            {activeTab === 'pending' && (
                                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                                    <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                                        <Calendar size={16} className="text-amber-600 shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Data do Contato</span>
                                            <span className="text-[11px] text-amber-800">Filtra os questionarios pela data em que o atendimento foi iniciado.</span>
                                        </div>
                                    </div>

                                    <input
                                        type="date"
                                        value={questionnaireDateFrom}
                                        onChange={e => setQuestionnaireDateFrom(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20"
                                        aria-label="Data inicial do contato"
                                    />

                                    <input
                                        type="date"
                                        value={questionnaireDateTo}
                                        onChange={e => setQuestionnaireDateTo(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20"
                                        aria-label="Data final do contato"
                                    />

                                    {(questionnaireDateFrom || questionnaireDateTo) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQuestionnaireDateFrom('');
                                                setQuestionnaireDateTo('');
                                            }}
                                            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
                                        >
                                            Limpar Periodo
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* List */}
                        {filteredTasks.length === 0 ? (
                            <div className="p-20 text-center text-slate-300 font-bold uppercase tracking-widest">
                                Nenhum item encontrado nesta aba.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {activeTab === 'pending' && (
                                    <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-100 text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                                        Exibindo {filteredTasks.length} questionario(s) pendente(s) para resposta.
                                    </div>
                                )}
                                {filteredTasks.map(task => (
                                    <div key={task.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-6 group">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${task.type === 'PÓS-VENDA' ? 'bg-blue-100 text-blue-700' :
                                                        task.type === 'VENDA' ? 'bg-green-100 text-green-700' :
                                                            'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    {task.type}
                                                </span>
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                                                    {new Date(task.createdAt).toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-lg">{task.clientName}</h3>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="flex items-center gap-2 text-slate-500 font-medium text-sm">
                                                    <Phone size={14} />
                                                    {task.clientPhone}
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(task.clientPhone || '')}
                                                        className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                                                        title="Copiar número"
                                                    >
                                                        <Copy size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions based on Tab */}
                                        {activeTab === 'queue' && (
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => openSkipModal(task)}
                                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
                                                >
                                                    <SkipForward size={16} /> Pular
                                                </button>
                                                <button
                                                    onClick={() => openWhatsApp(task.clientPhone || '')}
                                                    className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
                                                >
                                                    <ExternalLink size={16} /> Abrir WhatsApp
                                                </button>
                                                <button
                                                    onClick={() => handleStart(task)}
                                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-2"
                                                >
                                                    <CheckCircle size={16} /> Certo
                                                </button>
                                            </div>
                                        )}

                                        {activeTab === 'pending' && (
                                            <div className="flex items-center gap-3">
                                                <div className="text-right mr-4">
                                                    <p className="text-[10px] uppercase font-black text-amber-500 tracking-wider">Aguardando Retorno</p>
                                                    <p className="text-xs font-bold text-slate-400">Iniciado em {new Date(task.startedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleOpenQuestionnaire(task)}
                                                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2"
                                                >
                                                    <ClipboardList size={16} /> Responder Questionário
                                                </button>
                                            </div>
                                        )}

                                        {activeTab === 'history' && (
                                            <div className="text-right">
                                                <p className={`text-xs font-black uppercase tracking-wider ${task.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'
                                                    }`}>
                                                    {task.status === 'completed' ? 'Completo' : 'Pulado'}
                                                </p>
                                                {task.status === 'skipped' && (
                                                    <p className="text-xs text-slate-400 italic mt-1">{task.skipReason}</p>
                                                )}
                                            </div>
                                        )}

                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Skip Modal */}
            {skipModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md p-8">
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-6">Motivo do Pulo</h3>

                        <div className="space-y-3 mb-6">
                            {['Número Errado', 'Não Recebe Mensagem', 'Número não pertence ao cliente', 'Outros'].map(reason => (
                                <label key={reason} className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                                    <input
                                        type="radio"
                                        name="skipReason"
                                        value={reason}
                                        checked={skipReason === reason}
                                        onChange={e => setSkipReason(e.target.value)}
                                        className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="font-bold text-slate-700">{reason}</span>
                                </label>
                            ))}
                        </div>

                        <textarea
                            placeholder="Observação (opcional)..."
                            className="w-full p-4 bg-slate-50 rounded-xl border-none font-medium text-slate-700 min-h-[100px] mb-8 focus:ring-2 focus:ring-blue-500/20 resize-none"
                            value={skipNote}
                            onChange={e => setSkipNote(e.target.value)}
                        />

                        <div className="flex gap-4">
                            <button
                                onClick={() => setSkipModalOpen(false)}
                                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSkip}
                                disabled={!skipReason}
                                className="flex-1 py-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                            >
                                Confirmar Pulo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Questionnaire Modal */}
            {questionnaireModalOpen && taskToComplete && (
                <WhatsAppQuestionnaireModal
                    task={taskToComplete}
                    onClose={() => setQuestionnaireModalOpen(false)}
                    onComplete={handleCompleteTask}
                />
            )}

        </div>
    );
};

export default WhatsAppDashboard;
