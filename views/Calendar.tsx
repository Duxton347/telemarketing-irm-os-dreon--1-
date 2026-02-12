import React from 'react';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Phone, User, CheckCircle2,
    Plus, X, Save, Trash2, Edit2, Loader2, FileText
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Task, Visit, User as UserType, CallRecord, Client, Question, CallType, UserRole } from '../types';
import { QuestionnaireForm } from '../components/QuestionnaireForm';

const Calendar: React.FC<{ user: UserType }> = ({ user }) => {
    const [date, setDate] = React.useState(new Date());
    const [tasks, setTasks] = React.useState<Task[]>([]);
    const [visits, setVisits] = React.useState<Visit[]>([]);
    const [calls, setCalls] = React.useState<CallRecord[]>([]);
    const [clients, setClients] = React.useState<Client[]>([]);
    const [questions, setQuestions] = React.useState<Question[]>([]);

    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState<string | null>(new Date().toISOString().split('T')[0]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [editingCallId, setEditingCallId] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState({
        clientId: '',
        date: '',
        time: '',
        type: CallType.POS_VENDA,
        responses: {} as Record<string, any>
    });

    const loadData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [allTasks, allVisits, allCalls, allClients, allQuestions] = await Promise.all([
                dataService.getTasks(),
                dataService.getVisits(),
                dataService.getCalls(),
                dataService.getClients(),
                dataService.getQuestions()
            ]);

            setTasks(allTasks.filter(t => t.scheduledFor));
            setVisits(allVisits);
            setCalls(allCalls);
            setClients(allClients);
            setQuestions(allQuestions);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { loadData(); }, [loadData]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const daysInMonth = getDaysInMonth(date.getFullYear(), date.getMonth());
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const prevMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
    const nextMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(date.getFullYear(), date.getMonth(), i));
    }

    const getEventsForDate = (d: Date) => {
        const dateStr = d.toISOString().split('T')[0];
        const dayTasks = tasks.filter(t => t.scheduledFor && t.scheduledFor.startsWith(dateStr));
        const dayVisits = visits.filter(v => v.scheduledDate && v.scheduledDate.startsWith(dateStr));
        const dayCalls = calls.filter(c => c.startTime && c.startTime.startsWith(dateStr));
        return { tasks: dayTasks, visits: dayVisits, calls: dayCalls };
    };

    const selectedEvents = selectedDate ? {
        tasks: tasks.filter(t => t.scheduledFor && t.scheduledFor.startsWith(selectedDate)),
        visits: visits.filter(v => v.scheduledDate && v.scheduledDate.startsWith(selectedDate)),
        calls: calls.filter(c => c.startTime && c.startTime.startsWith(selectedDate))
    } : { tasks: [], visits: [], calls: [] };

    const handleOpenModal = (call?: CallRecord) => {
        if (call) {
            setEditingCallId(call.id);
            const d = new Date(call.startTime);
            setFormData({
                clientId: call.clientId,
                date: d.toISOString().split('T')[0],
                time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: call.type,
                responses: call.responses || {}
            });
        } else {
            setEditingCallId(null);
            setFormData({
                clientId: '',
                date: selectedDate || new Date().toISOString().split('T')[0],
                time: '09:00',
                type: CallType.POS_VENDA,
                responses: {}
            });
        }
        setIsModalOpen(true);
    };

    const handleSaveCall = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.clientId || !formData.date || !formData.time) return;

        setIsProcessing(true);
        try {
            const startTime = `${formData.date}T${formData.time}:00`;
            const endTime = startTime; // Mock end time

            const callData: Partial<CallRecord> = {
                clientId: formData.clientId,
                type: formData.type,
                startTime: startTime,
                endTime: endTime,
                responses: formData.responses,
                duration: 0,
                reportTime: 0
            };

            if (editingCallId) {
                await dataService.updateCall(editingCallId, callData);
            } else {
                await dataService.saveCall({
                    ...callData,
                    operatorId: user.id,
                    id: '',
                    taskId: undefined
                } as CallRecord);
            }
            await loadData();
            setIsModalOpen(false);
            alert("Registro salvo com sucesso!");
        } catch (e) {
            alert("Erro ao salvar registro.");
            console.error(e);
        } finally {
            setIsProcessing(false);
        }
    };

    // Admin Approval Actions
    const handleApproveTask = async (taskId: string) => {
        if (!confirm("Aprovar este agendamento?")) return;
        setIsProcessing(true);
        try {
            await dataService.updateTask(taskId, { approvalStatus: 'APPROVED' });
            await loadData();
            alert("Agendamento aprovado!");
        } catch (e) { alert("Erro ao aprovar."); }
        finally { setIsProcessing(false); }
    };

    const handleRejectTask = async (taskId: string) => {
        const reason = prompt("Motivo da rejeição/resolução:");
        if (!reason) return;

        setIsProcessing(true);
        try {
            await dataService.updateTask(taskId, {
                status: 'skipped',
                approvalStatus: 'RESOLVED',
                skipReason: `Rejeitado pelo ADM: ${reason}`
            });
            await loadData();
            alert("Agendamento resolvido/removido.");
        } catch (e) { alert("Erro ao rejeitar."); }
        finally { setIsProcessing(false); }
    };

    const handleDeleteCall = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este registro?")) return;
        setIsProcessing(true);
        try {
            await dataService.deleteCall(id);
            await loadData();
            alert("Registro excluído.");
        } catch (e) {
            alert("Erro ao excluir.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 pb-20">
            {/* PENDING APPROVALS SECTION (ADMIN ONLY) */}
            {user.role === UserRole.ADMIN && tasks.some(t => t.approvalStatus === 'PENDING') && (
                <div className="lg:col-span-12 bg-orange-50 rounded-[48px] p-8 border border-orange-200 shadow-sm animate-in slide-in-from-top-10">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="bg-orange-600 p-3 rounded-2xl text-white shadow-lg shadow-orange-500/30">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tighter text-orange-900">Aprovações Pendentes</h2>
                            <p className="text-orange-700 font-bold text-xs uppercase tracking-widest">Agendamentos solicitados por operadores</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tasks.filter(t => t.approvalStatus === 'PENDING').map(t => {
                            const client = clients.find(c => c.id === t.clientId);
                            return (
                                <div key={t.id} className="bg-white p-6 rounded-[32px] border border-orange-100 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                                    <h4 className="font-black text-slate-800 uppercase tracking-tighter">{client?.name || 'Cliente Desconhecido'}</h4>
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-bold text-slate-500 flex items-center gap-2">
                                            <CalendarIcon size={12} /> {new Date(t.scheduledFor!).toLocaleDateString()} às {new Date(t.scheduledFor!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        <p className="text-xs font-bold text-slate-500 flex items-center gap-2">
                                            <User size={12} /> Solicitado por: {t.assignedTo}
                                        </p>
                                        {t.scheduleReason && (
                                            <p className="text-[10px] font-bold text-orange-600 bg-orange-50 p-2 rounded-lg mt-2 border border-orange-100">
                                                "{t.scheduleReason}"
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 mt-4 pt-4 border-t border-slate-50">
                                        <button onClick={() => handleApproveTask(t.id)} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 max-w-[100px]">
                                            Aprovar
                                        </button>
                                        <button onClick={() => handleRejectTask(t.id)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-50 hover:text-red-500 transition-all">
                                            Rejeitar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="lg:col-span-8 space-y-6">
                <div className="bg-white rounded-[48px] p-8 shadow-sm border border-slate-100">
                    <header className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-4 text-slate-800">
                            <CalendarIcon className="text-blue-600" />
                            {date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        </h2>
                        <div className="flex gap-2">
                            <button onClick={prevMonth} className="p-3 rounded-full hover:bg-slate-100"><ChevronLeft /></button>
                            <button onClick={nextMonth} className="p-3 rounded-full hover:bg-slate-100"><ChevronRight /></button>
                        </div>
                    </header>

                    <div className="grid grid-cols-7 gap-4 mb-4 text-center">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => (
                            <span key={d} className="font-black text-slate-400 text-[10px] uppercase">{d}</span>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-4">
                        {days.map((d, i) => {
                            if (!d) return <div key={i} className="aspect-square"></div>;

                            const dateStr = d.toISOString().split('T')[0];
                            const isSelected = selectedDate === dateStr;
                            const isToday = dateStr === new Date().toISOString().split('T')[0];
                            const { tasks, visits, calls } = getEventsForDate(d);
                            const hasEvents = tasks.length > 0 || visits.length > 0 || calls.length > 0;

                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`aspect-square rounded-[24px] flex flex-col items-center justify-center relative transition-all ${isSelected ? 'bg-slate-900 text-white shadow-xl scale-110 z-10' : 'hover:bg-slate-50 text-slate-600'} ${isToday && !isSelected ? 'bg-blue-50 text-blue-600 font-bold' : ''}`}
                                >
                                    <span className="text-sm font-bold">{d.getDate()}</span>
                                    {hasEvents && (
                                        <div className="mt-1 flex gap-1 flex-wrap justify-center w-full px-2">
                                            {tasks.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>}
                                            {visits.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>}
                                            {calls.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <div className="bg-slate-900 rounded-[48px] p-10 text-white shadow-2xl min-h-[600px] flex flex-col">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter mb-1">Agenda do Dia</h3>
                            <p className="text-slate-400 font-bold text-sm">
                                {selectedDate ? new Date(selectedDate).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Selecione uma data'}
                            </p>
                        </div>
                        <button
                            onClick={() => handleOpenModal()}
                            className="w-12 h-12 flex items-center justify-center bg-blue-600 rounded-full hover:bg-blue-500 transition-all shadow-lg active:scale-95"
                            title="Novo Registro Manual"
                        >
                            <Plus size={24} />
                        </button>
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {selectedEvents.tasks.length === 0 && selectedEvents.visits.length === 0 && selectedEvents.calls.length === 0 && (
                            <p className="text-center text-slate-500 font-bold text-sm py-10 opacity-50">Nenhum evento agendado.</p>
                        )}

                        {selectedEvents.visits.map(v => (
                            <div key={v.id} className="p-4 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl space-y-2">
                                <div className="flex justify-between items-start">
                                    <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-black uppercase rounded">Visita</span>
                                    <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1"><Clock size={10} /> {new Date(v.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="font-bold text-sm">{v.clientName}</p>
                                <p className="text-[10px] text-emerald-200 flex items-center gap-1"><MapPin size={10} /> {v.address}</p>
                                <p className="text-[10px] text-emerald-200 flex items-center gap-1"><User size={10} /> {v.salespersonName}</p>
                            </div>
                        ))}

                        {selectedEvents.calls.map(c => {
                            const client = clients.find(cl => cl.id === c.clientId);
                            return (
                                <div key={c.id} className="p-4 bg-blue-600/20 border border-blue-500/30 rounded-2xl space-y-2 group relative">
                                    <div className="flex justify-between items-start">
                                        <span className="px-2 py-0.5 bg-blue-500 text-white text-[9px] font-black uppercase rounded">{c.type}</span>
                                        <span className="text-[10px] font-bold text-blue-300 flex items-center gap-1"><Clock size={10} /> {new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="font-bold text-sm">{client?.name || 'Cliente Desconhecido'}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-blue-200">
                                        <span className="italic">Registro Manual / Histórico</span>
                                    </div>

                                    {user.role === UserRole.ADMIN && (
                                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleOpenModal(c)} className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"><Edit2 size={12} /></button>
                                            <button onClick={() => handleDeleteCall(c.id)} className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200"><Trash2 size={12} /></button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {selectedEvents.tasks.map(t => (
                            <div key={t.id} className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl space-y-2">
                                <div className="flex justify-between items-start">
                                    <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] font-black uppercase rounded">Retorno Telefone</span>
                                    <span className="text-[10px] font-bold text-orange-300 flex items-center gap-1"><Clock size={10} /> {new Date(t.scheduledFor!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="font-bold text-sm">Tarefa de {t.type}</p>
                                {t.scheduleReason && <p className="text-[10px] text-orange-200 italic">"{t.scheduleReason}"</p>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                                <FileText size={24} className="text-blue-400" />
                                {editingCallId ? 'Editar Registro' : 'Novo Registro Manual'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={24} /></button>
                        </div>

                        <form onSubmit={handleSaveCall} className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Cliente</label>
                                    <select
                                        required
                                        value={formData.clientId}
                                        onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <option value="">Selecione...</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Tipo</label>
                                    <select
                                        required
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        {Object.values(CallType).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Data</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Horário</label>
                                    <input
                                        type="time"
                                        required
                                        value={formData.time}
                                        onChange={e => setFormData({ ...formData, time: e.target.value })}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <QuestionnaireForm
                                    questions={questions}
                                    responses={formData.responses}
                                    onResponseChange={(qId, val) => setFormData(prev => ({ ...prev, responses: { ...prev.responses, [qId]: val } }))}
                                    type={formData.type}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isProcessing}
                                className="w-full py-5 bg-blue-600 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                                {editingCallId ? 'Salvar Alterações' : 'Salvar Registro'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;
