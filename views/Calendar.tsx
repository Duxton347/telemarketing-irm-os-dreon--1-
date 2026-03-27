
import React, { useMemo } from 'react';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Phone, User, CheckCircle2,
    Plus, X, Save, Trash2, Edit2, Loader2, FileText, AlertCircle, MessageCircle, Filter, Search
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Task, Visit, User as UserType, CallRecord, Client, Question, CallType, UserRole, CallScheduleWithClient, OperatorEventType } from '../types';
import { QuestionnaireForm } from '../components/QuestionnaireForm';
import { ManualScheduleModal } from '../components/ManualScheduleModal';

const Calendar: React.FC<{ user: UserType }> = ({ user }: { user: UserType }) => {
    const [date, setDate] = React.useState(new Date());
    const [tasks, setTasks] = React.useState<Task[]>([]);
    const [schedules, setSchedules] = React.useState<CallScheduleWithClient[]>([]);
    const [visits, setVisits] = React.useState<Visit[]>([]);
    const [calls, setCalls] = React.useState<CallRecord[]>([]);
    const [clients, setClients] = React.useState<Client[]>([]);
    const [questions, setQuestions] = React.useState<Question[]>([]);
    const [operators, setOperators] = React.useState<UserType[]>([]); // New state for operators

    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState<string | null>(new Date().toISOString().split('T')[0]);
    const [activeTab, setActiveTab] = React.useState<'pending' | 'scheduled' | 'visits'>('pending');

    // Manual Schedule Modal State
    const [isManualScheduleModalOpen, setIsManualScheduleModalOpen] = React.useState(false);

    // --- Data Loading ---
    const loadData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [allTasks, allSchedules, allVisits, allCalls, allClients, allQuestions, allUsers] = await Promise.all([
                dataService.getTasks(),
                dataService.getSchedules(),
                dataService.getVisits(),
                dataService.getCalls(),
                dataService.getClients(),
                dataService.getQuestions(),
                dataService.getUsers() // Fetch users
            ]);

            setTasks(allTasks);
            setSchedules(allSchedules);
            setVisits(allVisits);
            setCalls(allCalls);
            setClients(allClients);
            setQuestions(allQuestions);
            setOperators(allUsers.filter(u => u.role === UserRole.OPERATOR || u.role === UserRole.SUPERVISOR)); // Filter operators
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { loadData(); }, [loadData]);


    // --- Derived State ---
    const daySchedules = useMemo(() => {
        if (!selectedDate) return [];
        return schedules.filter(s => s.scheduledFor.startsWith(selectedDate));
    }, [schedules, selectedDate]);

    const pendingSchedules = useMemo(() => {
        let pending = schedules.filter(s => s.status === 'PENDENTE_APROVACAO');
        if (selectedDate) {
            pending = pending.filter(s => s.scheduledFor.startsWith(selectedDate));
        }
        return pending.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
    }, [schedules, selectedDate]);

    const scheduledTasks = useMemo(() => {
        if (!selectedDate) return [];
        return tasks.filter(t => t.scheduledFor && t.scheduledFor.startsWith(selectedDate));
    }, [tasks, selectedDate]);

    const scheduledVisits = useMemo(() => {
        if (!selectedDate) return [];
        return visits.filter(v => v.scheduledDate && v.scheduledDate.startsWith(selectedDate));
    }, [visits, selectedDate]);


    // --- Calendar helpers ---
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const daysInMonth = getDaysInMonth(date.getFullYear(), date.getMonth());
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const days = Array(firstDayOfMonth).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => new Date(date.getFullYear(), date.getMonth(), i + 1)));

    const prevMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
    const nextMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));

    // --- Handlers ---

    // Approval Modal
    const [isApproveModalOpen, setIsApproveModalOpen] = React.useState(false);
    const [approvingItem, setApprovingItem] = React.useState<CallScheduleWithClient | null>(null);
    const [approveForm, setApproveForm] = React.useState<{ date: string, time: string, operatorId: string, type: CallType }>({
        date: '', time: '', operatorId: '', type: CallType.POS_VENDA
    });

    // Reschedule Modal
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = React.useState(false);
    const [reschedulingItem, setReschedulingItem] = React.useState<CallScheduleWithClient | null>(null);
    const [rescheduleForm, setRescheduleForm] = React.useState<{ date: string, time: string }>({
        date: '', time: ''
    });

    const openApproveModal = (item: CallScheduleWithClient) => {
        const d = new Date(item.scheduledFor);
        setApprovingItem(item);
        setApproveForm({
            date: d.toISOString().split('T')[0],
            time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            operatorId: item.assignedOperatorId,
            type: item.callType // Pre-fill with existing type
        });
        setIsApproveModalOpen(true);
    };

    const handleConfirmApprove = async () => {
        if (!approvingItem || !approveForm.date || !approveForm.time || !approveForm.operatorId) return;
        setIsProcessing(true);
        try {
            const newDateTime = `${approveForm.date}T${approveForm.time}:00`;
            const operatorName = operators.find(o => o.id === approveForm.operatorId)?.name || 'Operador';

            // 1. Update Schedule Status to CONCLUIDO
            await dataService.updateSchedule(approvingItem.id, {
                status: 'CONCLUIDO',
                scheduledFor: new Date(newDateTime).toISOString(),
                assignedOperatorId: approveForm.operatorId,
                callType: approveForm.type, // Update type if changed
                approvedByAdminId: user.id,
                approvalReason: 'Aprovado pelo Gestor'
            }, user.id);

            if (!approvingItem.customerId) {
                alert("Erro: Este agendamento não possui um cliente vinculado. Não é possível gerar a tarefa.");
                return;
            }

            // 2. Create Task in Queue (TARGET: WORK QUEUE)
            await dataService.createTask({
                clientId: approvingItem.customerId,
                type: approveForm.type, // Use selected type
                assignedTo: approveForm.operatorId, // Use selected operator
                status: 'pending', // This puts it in the queue
                scheduledFor: new Date(newDateTime).toISOString(),
                scheduleReason: `Repique Aprovado: ${approvingItem.scheduleReason}`
            });

            await dataService.logOperatorEvent(user.id, OperatorEventType.ADMIN_APROVAR, undefined, `Aprovou repique para ${approvingItem.clientName} -> ${operatorName} (${approveForm.type})`);

            await loadData();
            setIsApproveModalOpen(false);
            setApprovingItem(null);
            alert("Agendamento aprovado e enviado para a fila de trabalho!");
        } catch (e) {
            console.error(e);
            alert("Erro ao aprovar.");
        } finally {
            setIsProcessing(false);
        }
    };

    const openRescheduleModal = (item: CallScheduleWithClient) => {
        const d = new Date(item.scheduledFor);
        setReschedulingItem(item);
        setRescheduleForm({
            date: d.toISOString().split('T')[0],
            time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        setIsRescheduleModalOpen(true);
    };

    const handleConfirmReschedule = async () => {
        if (!reschedulingItem || !rescheduleForm.date || !rescheduleForm.time) return;
        setIsProcessing(true);
        try {
            const newDateTime = `${rescheduleForm.date}T${rescheduleForm.time}:00`;

            await dataService.updateSchedule(reschedulingItem.id, {
                scheduledFor: new Date(newDateTime).toISOString(),
            }, user.id);

            await dataService.logOperatorEvent(user.id, OperatorEventType.ADMIN_REAGENDAR, undefined, `Reagendou retorno para ${reschedulingItem.clientName}`);

            await loadData();
            setIsRescheduleModalOpen(false);
            setReschedulingItem(null);
            alert("Agendamento reprogramado com sucesso!");
        } catch (e) {
            console.error(e);
            alert("Erro ao reagendar.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id: string) => {
        if (!confirm("Tem certeza que deseja EXCLUIR este agendamento?")) return;
        setIsProcessing(true);
        try {
            await dataService.updateSchedule(id, {
                status: 'CANCELADO',
            }, user.id);

            await dataService.logOperatorEvent(user.id, OperatorEventType.ADMIN_REJEITAR, undefined, `Rejeitou agendamento ${id}`);

            await loadData();
        } catch (e) {
            alert("Erro ao excluir.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Left Sidebar - Calendar */}
            <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
                <div className="p-6 border-b border-slate-100">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <CalendarIcon className="text-orange-500" /> Agenda
                    </h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Gestão de Retornos</p>
                </div>

                <div className="p-4">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-orange-600 transition-colors">
                            <ChevronLeft size={20} />
                        </button>
                        <span className="font-black text-slate-700 uppercase tracking-widest text-sm">
                            {date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-orange-600 transition-colors">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dayLabel, index) => (
                            <div key={`calendar-weekday-${index}-${dayLabel}`} className="h-8 flex items-center justify-center text-[10px] font-black text-slate-300">
                                {dayLabel}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((d, i) => {
                            if (!d) return <div key={i} />;
                            const dStr = d.toISOString().split('T')[0];
                            const isSelected = selectedDate === dStr;
                            const isToday = dStr === new Date().toISOString().split('T')[0];

                            const hasPending = schedules.some(s => s.scheduledFor.startsWith(dStr) && s.status === 'PENDENTE_APROVACAO');
                            const hasTask = tasks.some(t => t.scheduledFor && t.scheduledFor.startsWith(dStr));

                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDate(dStr)}
                                    className={`
                                        h-10 rounded-xl flex flex-col items-center justify-center relative transition-all
                                        ${isSelected ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 scale-105' : 'hover:bg-slate-50 text-slate-600'}
                                        ${isToday && !isSelected ? 'ring-2 ring-orange-100' : ''}
                                    `}
                                >
                                    <span className="text-xs font-bold">{d.getDate()}</span>
                                    <div className="flex gap-0.5 mt-0.5">
                                        {hasPending && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-red-500'}`} />}
                                        {hasTask && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/50' : 'bg-emerald-500'}`} />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-auto p-4 bg-slate-50 border-t border-slate-100">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                            <div className="w-2 h-2 rounded-full bg-red-500" /> Pendentes
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" /> Agendados
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-20 bg-white border-b border-slate-200 flex items-center px-8 justify-between shrink-0">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'pending'
                                ? 'bg-white text-orange-600 shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <AlertCircle size={14} />
                                Pendentes ({pendingSchedules.length})
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('scheduled')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'scheduled'
                                ? 'bg-white text-emerald-600 shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={14} />
                                Agendados ({selectedDate ? scheduledTasks.length : tasks.length})
                            </div>
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsManualScheduleModalOpen(true)}
                            className="px-4 py-2 bg-orange-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-orange-600/20 active:scale-95 transition-all flex items-center gap-2 hover:bg-orange-500"
                        >
                            <Plus size={16} /> Novo Agendamento
                        </button>
                        <div className="text-right">
                            <h2 className="text-lg font-black text-slate-800 tracking-tight">
                                {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', weekday: 'long' }) : 'Todos os dias'}
                            </h2>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-8">
                    {activeTab === 'pending' && (
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {pendingSchedules.length === 0 ? (
                                <div className="text-center py-20 opacity-50">
                                    <CheckCircle2 size={64} className="mx-auto mb-4 text-slate-300" />
                                    <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Tudo limpo!</h3>
                                    <p className="text-slate-400 font-medium">Nenhum repique pendente de aprovação.</p>
                                </div>
                            ) : (
                                pendingSchedules.map(item => (
                                    <div key={item.id} className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all flex items-start gap-6 group">
                                        {/* Date Box */}
                                        <div className="bg-orange-50 rounded-2xl p-4 text-center min-w-[100px] shrink-0">
                                            <span className="block text-2xl font-black text-orange-600">
                                                {new Date(item.scheduledFor).getDate()}
                                            </span>
                                            <span className="block text-xs font-bold text-orange-400 uppercase tracking-wider">
                                                {new Date(item.scheduledFor).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                                            </span>
                                            <div className="mt-2 text-[10px] font-bold text-orange-300 bg-orange-100/50 py-1 px-2 rounded-lg inline-block">
                                                {new Date(item.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h3 className="text-lg font-black text-slate-800 truncate">{item.clientName || 'Cliente Desconhecido'}</h3>
                                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mt-1">
                                                        <Phone size={12} /> {item.clientPhone || 'Sem telefone'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {item.whatsappSent && (
                                                        <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                            <MessageCircle size={12} fill="currentColor" /> WhatsApp
                                                        </div>
                                                    )}
                                                    <div className="bg-slate-100 text-slate-500 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                                        {item.callType}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-slate-50 rounded-xl p-4 mb-4">
                                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Motivo do Pulo/Repique:</span>
                                                    {item.skipReason || item.scheduleReason || "Sem motivo especificado"}
                                                </p>
                                                {item.whatsappNote && (
                                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                                        <span className="text-emerald-500 text-xs font-bold uppercase tracking-wider block mb-1">Nota WhatsApp:</span>
                                                        <span className="text-slate-600 text-sm">{item.whatsappNote}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                                                        {user.username?.substring(0, 2) || 'OP'}
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400">Solicitado por {operators.find(o => o.id === item.requestedByOperatorId)?.name || item.requestedByOperatorId.substring(0, 8) + '...'}</span>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleReject(item.id)}
                                                        className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-red-500 hover:bg-red-50 transition-colors"
                                                    >
                                                        Excluir
                                                    </button>
                                                    <button
                                                        onClick={() => openRescheduleModal(item)}
                                                        className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-colors"
                                                    >
                                                        Reagendar
                                                    </button>
                                                    <button
                                                        onClick={() => openApproveModal(item)}
                                                        className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-orange-600 hover:shadow-lg hover:-translate-y-0.5 transition-all shadow-md"
                                                    >
                                                        Review & Aprovar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'scheduled' && (
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {scheduledTasks.length === 0 ? (
                                <div className="text-center py-20 opacity-50">
                                    <Clock size={64} className="mx-auto mb-4 text-slate-300" />
                                    <p className="text-slate-400 font-medium">Nenhum agendamento para este dia.</p>
                                </div>
                            ) : (
                                scheduledTasks.map(task => (
                                    <div key={task.id} className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase text-emerald-500 tracking-widest mb-1 block">
                                                {new Date(task.scheduledFor!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <h3 className="text-lg font-black text-slate-800">{task.clientId}</h3>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{task.type}</span>
                                                <span className="text-xs font-bold text-slate-400 bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-lg">
                                                    {operators.find(u => u.id === task.assignedTo)?.name || 'Operador'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-500 mt-2">{task.scheduleReason}</p>
                                        </div>
                                        <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold uppercase tracking-widest">
                                            Na Fila
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Manual Schedule Modal */}
            {isManualScheduleModalOpen && (
                <ManualScheduleModal
                    onClose={() => setIsManualScheduleModalOpen(false)}
                    onSuccess={loadData}
                    user={user}
                />
            )}

            {/* Approval Modal */}
            {isApproveModalOpen && approvingItem && (
                <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in zoom-in duration-200">
                        <h3 className="text-2xl font-black text-slate-800 text-center mb-6 uppercase tracking-tight">Confirmar e Enviar para Fila</h3>

                        <div className="space-y-4 mb-8">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Data</label>
                                    <input
                                        type="date"
                                        value={approveForm.date}
                                        onChange={e => setApproveForm({ ...approveForm, date: e.target.value })}
                                        className="w-full h-12 rounded-xl border-2 border-slate-100 px-4 font-bold text-slate-700 focus:border-orange-500 outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Horário</label>
                                    <input
                                        type="time"
                                        value={approveForm.time}
                                        onChange={e => setApproveForm({ ...approveForm, time: e.target.value })}
                                        className="w-full h-12 rounded-xl border-2 border-slate-100 px-4 font-bold text-slate-700 focus:border-orange-500 outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tipo de Chamada</label>
                                <select
                                    value={approveForm.type}
                                    onChange={e => setApproveForm({ ...approveForm, type: e.target.value as CallType })}
                                    className="w-full h-12 rounded-xl border-2 border-slate-100 px-4 font-bold text-slate-700 focus:border-orange-500 outline-none transition-colors appearance-none bg-white"
                                >
                                    {Object.values(CallType).filter(t => t !== CallType.WHATSAPP).map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Atribuir para Operador</label>
                                <select
                                    value={approveForm.operatorId}
                                    onChange={e => setApproveForm({ ...approveForm, operatorId: e.target.value })}
                                    className="w-full h-12 rounded-xl border-2 border-slate-100 px-4 font-bold text-slate-700 focus:border-orange-500 outline-none transition-colors appearance-none bg-white"
                                >
                                    {operators.map(op => (
                                        <option key={op.id} value={op.id}>{op.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setIsApproveModalOpen(false)}
                                className="flex-1 py-4 rounded-xl font-bold text-slate-400 hover:bg-slate-50 uppercase text-xs tracking-widest transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmApprove}
                                disabled={isProcessing}
                                className="flex-1 py-4 rounded-xl font-black text-white bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-200 uppercase text-xs tracking-widest transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isProcessing ? 'Confirmando...' : 'Aprovar e Agendar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reschedule Modal */}
            {isRescheduleModalOpen && reschedulingItem && (
                <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in duration-200">
                        <h3 className="text-xl font-black text-slate-800 text-center mb-6 uppercase tracking-tight">Reagendar Retorno</h3>

                        <div className="space-y-4 mb-8">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Nova Data</label>
                                <input
                                    type="date"
                                    value={rescheduleForm.date}
                                    onChange={e => setRescheduleForm({ ...rescheduleForm, date: e.target.value })}
                                    className="w-full h-12 rounded-xl border-2 border-slate-100 px-4 font-bold text-slate-700 focus:border-orange-500 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Novo Horário</label>
                                <input
                                    type="time"
                                    value={rescheduleForm.time}
                                    onChange={e => setRescheduleForm({ ...rescheduleForm, time: e.target.value })}
                                    className="w-full h-12 rounded-xl border-2 border-slate-100 px-4 font-bold text-slate-700 focus:border-orange-500 outline-none transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setIsRescheduleModalOpen(false)}
                                className="flex-1 py-4 rounded-xl font-bold text-slate-400 hover:bg-slate-50 uppercase text-xs tracking-widest transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmReschedule}
                                disabled={isProcessing}
                                className="flex-1 py-4 rounded-xl font-black text-white bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-200 uppercase text-xs tracking-widest transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isProcessing ? 'Carregando...' : 'Reagendar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;
