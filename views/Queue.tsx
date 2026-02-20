
import React from 'react';
import { QuestionnaireForm } from '../components/QuestionnaireForm';
import {
  Phone, PhoneOff, SkipForward, Play, CheckCircle2,
  Loader2, Clock, MapPin, User, FileText, AlertCircle, Save, X, MessageCircle, Copy, Check, ChevronRight, AlertTriangle, ClipboardList, Zap, Calendar
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Task, Client, Question, CallType, OperatorEventType, ProtocolStatus } from '../types';
import { SKIP_REASONS, PROTOCOL_SLA } from '../constants';

interface QueueProps {
  user: any;
}

const Queue: React.FC<QueueProps> = ({ user }) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [currentTask, setCurrentTask] = React.useState<Task | null>(null);
  const [client, setClient] = React.useState<Client | null>(null);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [responses, setResponses] = React.useState<Record<string, any>>({});
  const [callSummary, setCallSummary] = React.useState('');

  const [isCalling, setIsCalling] = React.useState(false);
  const [isFillingReport, setIsFillingReport] = React.useState(false);
  const [isSkipModalOpen, setIsSkipModalOpen] = React.useState(false);
  const [callDuration, setCallDuration] = React.useState(0);
  const [reportDuration, setReportDuration] = React.useState(0);
  const [startTime, setStartTime] = React.useState<string | null>(null);
  const [isCopied, setIsCopied] = React.useState(false);
  const [hasRecentCall, setHasRecentCall] = React.useState(false);

  // Estados para abertura de protocolo no report
  const [needsProtocol, setNeedsProtocol] = React.useState(false);
  const [protoData, setProtoData] = React.useState({
    title: '',
    departmentId: 'atendimento',
    priority: 'Média' as 'Baixa' | 'Média' | 'Alta'
  });

  // Scheduling State
  const [scheduleData, setScheduleData] = React.useState({
    isScheduling: false,
    date: '',
    time: '',
    reason: '',
    type: CallType.POS_VENDA
  });

  // Sync schedule type with current task
  React.useEffect(() => {
    if (currentTask) {
      setScheduleData(prev => ({ ...prev, type: currentTask.type }));
    }
  }, [currentTask]);

  const config = dataService.getProtocolConfig();

  const resetState = React.useCallback(() => {
    setIsCalling(false);
    setIsFillingReport(false);
    setIsSkipModalOpen(false);
    setCallDuration(0);
    setReportDuration(0);
    setResponses({});
    setCallSummary('');
    setStartTime(null);
    setHasRecentCall(false);
    setNeedsProtocol(false);
    setProtoData({ title: '', departmentId: 'atendimento', priority: 'Média' });
    setScheduleData({ isScheduling: false, date: '', time: '', reason: '' });
  }, []);

  // State for upcoming tasks
  const [upcomingTasks, setUpcomingTasks] = React.useState<Task[]>([]);

  const fetchQueue = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [allTasks, allQuestions, allClients] = await Promise.all([
        dataService.getTasks(),
        dataService.getQuestions(),
        dataService.getClients()
      ]);
      setQuestions(allQuestions);

      const now = new Date();
      // Filter out tasks that are waiting for approval
      const myPendingTasks = allTasks.filter(t =>
        t.assignedTo === user.id &&
        t.status === 'pending' &&
        (t.approvalStatus === 'APPROVED' || !t.approvalStatus)
      );

      const dueTasks = myPendingTasks.filter(t => !t.scheduledFor || new Date(t.scheduledFor) <= now);
      const futureTasks = myPendingTasks.filter(t => t.scheduledFor && new Date(t.scheduledFor) > now);
      setUpcomingTasks(futureTasks);

      // Prioritize scheduled tasks that are due
      dueTasks.sort((a, b) => {
        if (a.scheduledFor && !b.scheduledFor) return -1;
        if (!a.scheduledFor && b.scheduledFor) return 1;
        return 0; // Maintain existing order (created_at)
      });

      const myTask = dueTasks[0];
      if (myTask) {
        const foundClient = allClients.find(c => c.id === myTask.clientId);
        setCurrentTask(myTask);
        setClient(foundClient || null);

        if (foundClient) {
          const recent = await dataService.checkRecentCall(foundClient.id);
          setHasRecentCall(recent);
        }
      } else {
        setCurrentTask(null);
        setClient(null);
      }
      resetState();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [user.id, resetState]);

  React.useEffect(() => { fetchQueue(); }, [fetchQueue]);

  React.useEffect(() => {
    let interval: any;
    if (isCalling) interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    else if (isFillingReport) interval = setInterval(() => setReportDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [isCalling, isFillingReport]);

  const handleStartCall = async () => {
    setIsCalling(true);
    setStartTime(new Date().toISOString());
    if (currentTask) {
      await dataService.logOperatorEvent(user.id, OperatorEventType.INICIAR_PROXIMO_ATENDIMENTO, currentTask.id);
    }
  };

  const handleEndCall = () => {
    setIsCalling(false);
    setIsFillingReport(true);
  };

  const handleSkipDuringCall = () => {
    setIsSkipModalOpen(true);
  };

  // New state for Skip-Reschedule flow
  const [skipReasonSelected, setSkipReasonSelected] = React.useState<string | null>(null);
  const [whatsappCheck, setWhatsappCheck] = React.useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = React.useState(false);

  const handleCopyPhone = () => {
    if (client) {
      navigator.clipboard.writeText(client.phone);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    if (client) {
      const phone = client.phone.replace(/\D/g, '');
      const url = `https://wa.me/55${phone}`;
      window.open(url, '_blank');
    }
  };

  const handleLogWhatsApp = async () => {
    if (!currentTask || !client) return;
    if (!confirm("Registrar interação via WhatsApp e finalizar esta tarefa?")) return;

    setIsProcessing(true);
    try {
      await dataService.saveCall({
        id: '',
        taskId: currentTask.id,
        operatorId: user.id,
        clientId: client.id,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        reportTime: 0,
        responses: { call_type: CallType.WHATSAPP },
        type: CallType.WHATSAPP,
      });
      await dataService.updateTask(currentTask.id, { status: 'completed' });
      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id, 'Interação WhatsApp');
      await fetchQueue();
      alert("Interação registrada!");
    } catch (e) {
      alert("Erro ao registrar WhatsApp.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveToWhatsApp = async () => {
    if (!currentTask) return;
    if (!confirm("Mover este atendimento para a fila do WhatsApp? A chamada atual será encerrada/pulada.")) return;

    setIsProcessing(true);
    try {
      await dataService.moveCallToWhatsApp(currentTask.id, user.id);
      alert("Atendimento movido para o WhatsApp com sucesso!");
      setIsSkipModalOpen(false);
      fetchQueue();
    } catch (e) {
      console.error(e);
      alert("Erro ao mover para WhatsApp.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectSkipReason = (reason: string) => {
    setSkipReasonSelected(reason);
    setIsSkipModalOpen(false);
    setIsRescheduleModalOpen(true);
    setWhatsappCheck(false); // Reset check
  };

  const confirmRescheduleSkip = async (interval: '1d' | '2d' | '1w' | '1m' | 'manual', manualDate?: string, manualTime?: string) => {
    if (!currentTask || !skipReasonSelected) return;

    setIsProcessing(true);

    try {
      const date = new Date();
      // Calculate next date
      if (interval === '1d') date.setDate(date.getDate() + 1);
      else if (interval === '2d') date.setDate(date.getDate() + 2);
      else if (interval === '1w') date.setDate(date.getDate() + 7);
      else if (interval === '1m') date.setMonth(date.getMonth() + 1);

      // Default time: 09:00 AM
      date.setHours(9, 0, 0, 0);

      // 1. Log WhatsApp if checked (Scenario B)
      if (whatsappCheck) {
        await dataService.saveCall({
          id: '',
          taskId: currentTask.id,
          operatorId: user.id,
          clientId: client?.id || '',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 0,
          reportTime: 0,
          responses: { call_type: CallType.WHATSAPP, note: 'Registrado via Pulo de Atendimento' },
          type: CallType.WHATSAPP,
        });
      }

      // 2. Create Schedule Request (Scenario B & C)
      await dataService.createScheduleRequest({
        requestedByOperatorId: user.id,
        assignedOperatorId: user.id,
        customerId: currentTask.clientId,
        originCallId: currentTask.id,
        scheduledFor: date.toISOString(),
        callType: currentTask.type,
        scheduleReason: `Repique: ${skipReasonSelected}`,
        status: 'PENDENTE_APROVACAO',
        skipReason: skipReasonSelected,
        whatsappSent: whatsappCheck,
        hasRepick: true
      });

      // 3. Mark current task as skipped
      await dataService.updateTask(currentTask.id, {
        status: 'skipped',
        skipReason: skipReasonSelected,
      });

      await dataService.logOperatorEvent(user.id, OperatorEventType.PULAR_ATENDIMENTO, currentTask.id, `${skipReasonSelected} (Reagendado para ${date.toLocaleDateString()} - WhatsApp: ${whatsappCheck ? 'Sim' : 'Não'})`);
      await fetchQueue();
    } catch (e) {
      alert("Erro ao solicitar reagendamento.");
      console.error(e);
    } finally {
      setIsProcessing(false);
      setIsRescheduleModalOpen(false);
      setSkipReasonSelected(null);
      setWhatsappCheck(false);
    }
  };

  const handleWhatsappOnly = async () => {
    if (!currentTask || !client) return;
    if (!whatsappCheck) {
      alert("Marque a opção de WhatsApp para confirmar que houve comunicação.");
      return;
    }

    if (!confirm("Confirmar que houve contato WhatsApp e finalizar SEM agendar novo retorno?")) return;

    setIsProcessing(true);
    try {
      // Log WhatsApp
      await dataService.saveCall({
        id: '',
        taskId: currentTask.id,
        operatorId: user.id,
        clientId: client.id,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        reportTime: 0,
        responses: { call_type: CallType.WHATSAPP, note: 'Finalizado via Pulo (Só WhatsApp)' },
        type: CallType.WHATSAPP,
      });

      // Complete Task
      await dataService.updateTask(currentTask.id, { status: 'completed' });

      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id, `Pulo com WhatsApp (Sem Repique) - Motivo: ${skipReasonSelected}`);
      await fetchQueue();
    } catch (e) {
      alert("Erro ao finalizar.");
    } finally {
      setIsProcessing(false);
      setIsRescheduleModalOpen(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!currentTask || !client) return;

    if (needsProtocol && !protoData.title.trim()) {
      alert("Informe um título para o protocolo.");
      return;
    }

    if (scheduleData.isScheduling && (!scheduleData.date || !scheduleData.time)) {
      alert("Informe a data e hora para o agendamento.");
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Protocol Logic
      if (needsProtocol) {
        const slaHours = PROTOCOL_SLA[protoData.priority] || 48;
        const now = new Date();
        const p = {
          clientId: client.id,
          openedByOperatorId: user.id,
          ownerOperatorId: user.id,
          origin: 'Atendimento',
          departmentId: protoData.departmentId,
          title: protoData.title.trim(),
          description: callSummary || 'Protocolo aberto via finalização de chamada.',
          priority: protoData.priority,
          status: ProtocolStatus.ABERTO,
          openedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          slaDueAt: new Date(now.getTime() + slaHours * 3600000).toISOString()
        };
        await dataService.saveProtocol(p as any, user.id);
      }

      // 2. Save Call Record
      const callData = {
        id: '',
        taskId: currentTask.id,
        operatorId: user.id,
        clientId: client.id,
        startTime: startTime!,
        endTime: new Date().toISOString(),
        duration: callDuration,
        reportTime: reportDuration,
        responses: { ...responses, written_report: callSummary, call_type: currentTask.type },
        type: currentTask.type,
      };
      await dataService.saveCall(callData);

      // 3. Update Task (Complete or Schedule)
      if (scheduleData.isScheduling) {
        // Create Schedule Request
        const scheduledDateTime = new Date(`${scheduleData.date}T${scheduleData.time}:00`).toISOString();

        await dataService.createScheduleRequest({
          requestedByOperatorId: user.id,
          assignedOperatorId: user.id,
          customerId: client.id,
          originCallId: currentTask.id,
          scheduledFor: scheduledDateTime,
          callType: scheduleData.type,
          scheduleReason: scheduleData.reason,
          status: 'PENDENTE_APROVACAO'
        });

        // Complete current task
        await dataService.updateTask(currentTask.id, { status: 'completed' });
        await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id, `Finalizado com solicitação de agendamento: ${scheduleData.date}`);

      } else {
        // Just complete
        await dataService.updateTask(currentTask.id, { status: 'completed' });
        await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id, 'Finalizado sem agendamento');
      }


      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id);
      await fetchQueue();
    } catch (e) { alert("Erro ao salvar relatório."); }
    finally { setIsProcessing(false); }
  };

  if (isLoading) return <div className="h-full flex items-center justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  if (!currentTask || !client) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 p-20 bg-white rounded-[56px] border border-dashed border-slate-200">
        <Phone size={48} className="text-slate-200" />
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Nenhuma chamada pendente</h3>
        {upcomingTasks.length > 0 && (
          <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 flex flex-col items-center gap-2 max-w-md">
            <Clock className="text-orange-500" size={24} />
            <p className="font-bold text-slate-600 text-center">Você tem <strong className="text-orange-600">{upcomingTasks.length}</strong> agendamentos futuros na fila.</p>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Eles aparecerão aqui no horário agendado.</p>
            <div className="w-full mt-4 space-y-2">
              {upcomingTasks.slice(0, 3).map(t => (
                <div key={t.id} className="bg-white p-3 rounded-xl text-xs font-bold text-slate-500 flex justify-between">
                  <span>{new Date(t.scheduledFor!).toLocaleString()}</span>
                  <span className="uppercase">{t.clientName || 'Cliente'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={fetchQueue} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">Atualizar</button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 pb-20">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 rounded-[48px] p-10 text-white shadow-2xl space-y-8 relative overflow-hidden">
            {hasRecentCall && (
              <div className="absolute top-0 left-0 w-full bg-red-600 text-white py-2 px-4 text-center animate-pulse flex items-center justify-center gap-2">
                <AlertTriangle size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">Atenção: Ligado nos últimos 3 dias</span>
              </div>
            )}

            <div className={hasRecentCall ? 'pt-6' : ''}>
              <span className="px-3 py-1 bg-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{currentTask.type}</span>
              <h3 className="text-3xl font-black mt-4 tracking-tighter uppercase">{client.name}</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-400 flex items-center gap-2">
                  <Phone size={18} /> {client.phone}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopyPhone} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
                    {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                  <button onClick={handleWhatsApp} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-all">
                    <MessageCircle size={16} />
                  </button>
                </div>
              </div>
              <p className="font-bold text-slate-400 flex items-start gap-2"><MapPin size={18} className="shrink-0" /> {client.address || 'Sem endereço'}</p>
            </div>

            <div className="pt-6 border-t border-slate-800">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Portfólio de Equipamentos</p>
              <div className="flex flex-wrap gap-2">
                {client.items && client.items.length > 0 ? client.items.map((it, i) => (
                  <span key={i} className="px-3 py-1 bg-slate-800 text-[10px] font-black uppercase text-slate-300 rounded-md border border-slate-700">{it}</span>
                )) : (
                  <span className="text-xs text-slate-600 italic">Nenhum equipamento cadastrado</span>
                )}
              </div>
            </div>
          </div>

          {!isCalling && !isFillingReport && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleStartCall} className="py-6 bg-blue-600 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                <Play size={20} /> Iniciar
              </button>
              <button onClick={() => setIsSkipModalOpen(true)} disabled={isProcessing} className="py-6 bg-slate-200 text-slate-600 rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-sm flex items-center justify-center gap-3 hover:bg-slate-300 active:scale-95 transition-all">
                <SkipForward size={20} /> Pular
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {(isCalling || isFillingReport) ? (
            <div className="bg-white rounded-[56px] shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[600px] animate-in slide-in-from-right-4">
              <header className="bg-slate-900 p-8 flex justify-between items-center text-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse"><Phone size={20} /></div>
                  <div>
                    <h4 className="font-black uppercase tracking-widest text-[10px] text-slate-400">Status Atendimento</h4>
                    <p className="text-xl font-black">{isFillingReport ? 'Preenchendo Relatório' : 'Ligação em Curso'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right mr-4">
                    <p className="text-[9px] font-black text-slate-500 uppercase">Tempo</p>
                    <p className="font-black text-lg">{Math.floor(callDuration / 60)}m {callDuration % 60}s</p>
                  </div>
                  {isCalling && (
                    <div className="flex gap-2">
                      <button onClick={handleSkipDuringCall} className="px-6 py-4 bg-slate-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-600 active:scale-95 transition-all">Pular</button>
                      <button onClick={handleEndCall} className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl active:scale-95 transition-all">Desligar</button>
                    </div>
                  )}
                </div>
              </header>

              <div className="flex-1 p-10 space-y-12 overflow-y-auto custom-scrollbar">
                <QuestionnaireForm
                  questions={questions}
                  responses={responses}
                  onResponseChange={(qId, val) => setResponses(prev => ({ ...prev, [qId]: val }))}
                  type={currentTask.type}
                />

                <section className="space-y-4">
                  <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                    <FileText size={18} className="text-blue-600" /> Resumo da Conversa
                  </h5>
                  <textarea value={callSummary} onChange={e => setCallSummary(e.target.value)} className="w-full p-8 bg-slate-50 rounded-[40px] border border-slate-100 font-bold text-slate-800 h-48 outline-none resize-none focus:ring-8 focus:ring-blue-500/5 transition-all" placeholder="O que foi conversado? Anote detalhes importantes para o próximo contato." />
                </section>

                {isFillingReport && (
                  <section className="space-y-6 p-10 bg-blue-50/50 rounded-[48px] border border-blue-100 animate-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-3">
                        <ClipboardList size={22} /> Gerar Protocolo de Atendimento?
                      </h5>
                      <button
                        onClick={() => setNeedsProtocol(!needsProtocol)}
                        className={`w-14 h-8 rounded-full transition-all relative ${needsProtocol ? 'bg-blue-600 shadow-lg shadow-blue-500/30' : 'bg-slate-300'}`}
                      >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${needsProtocol ? 'left-7' : 'left-1'}`}></div>
                      </button>
                    </div>

                    {needsProtocol && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4">
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título do Protocolo</label>
                          <input
                            type="text"
                            value={protoData.title}
                            onChange={e => setProtoData({ ...protoData, title: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500"
                            placeholder="Ex: Reclamação de atraso na bomba..."
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Setor Responsável</label>
                          <select
                            value={protoData.departmentId}
                            onChange={e => setProtoData({ ...protoData, departmentId: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none"
                          >
                            {config.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prioridade</label>
                          <select
                            value={protoData.priority}
                            onChange={e => setProtoData({ ...protoData, priority: e.target.value as any })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none"
                          >
                            <option value="Baixa">Baixa</option>
                            <option value="Média">Média</option>
                            <option value="Alta">Alta</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {isFillingReport && (
                  <section className="space-y-6 p-10 bg-orange-50/50 rounded-[48px] border border-orange-100 animate-in slide-in-from-bottom-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[11px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-3">
                        <Calendar size={22} /> Agendar Retorno?
                      </h5>
                      <button
                        onClick={() => setScheduleData({ ...scheduleData, isScheduling: !scheduleData.isScheduling })}
                        className={`w-14 h-8 rounded-full transition-all relative ${scheduleData.isScheduling ? 'bg-orange-500 shadow-lg shadow-orange-500/30' : 'bg-slate-300'}`}
                      >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${scheduleData.isScheduling ? 'left-7' : 'left-1'}`}></div>
                      </button>
                    </div>

                    {scheduleData.isScheduling && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4">
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Agendamento Rápido</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                setScheduleData({ ...scheduleData, date: tomorrow.toISOString().split('T')[0] });
                              }}
                              className="flex-1 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 hover:border-orange-300 transition-all active:scale-95"
                            >
                              +1 Dia
                            </button>
                            <button
                              onClick={() => {
                                const nextWeek = new Date();
                                nextWeek.setDate(nextWeek.getDate() + 7);
                                setScheduleData({ ...scheduleData, date: nextWeek.toISOString().split('T')[0] });
                              }}
                              className="flex-1 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 hover:border-orange-300 transition-all active:scale-95"
                            >
                              +1 Semana
                            </button>
                            <button
                              onClick={() => {
                                const nextMonth = new Date();
                                nextMonth.setMonth(nextMonth.getMonth() + 1);
                                setScheduleData({ ...scheduleData, date: nextMonth.toISOString().split('T')[0] });
                              }}
                              className="flex-1 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 hover:border-orange-300 transition-all active:scale-95"
                            >
                              +1 Mês
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                          <input
                            type="date"
                            value={scheduleData.date}
                            onChange={e => setScheduleData({ ...scheduleData, date: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500"
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horário</label>
                          <input
                            type="time"
                            value={scheduleData.time}
                            onChange={e => setScheduleData({ ...scheduleData, time: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gênero da Ligação</label>
                          <select
                            value={scheduleData.type}
                            onChange={e => setScheduleData({ ...scheduleData, type: e.target.value as CallType })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-[10px] uppercase outline-none focus:border-orange-500"
                          >
                            {Object.values(CallType)
                              .filter(t => t !== CallType.WHATSAPP)
                              .map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo do Agendamento</label>
                          <input
                            type="text"
                            value={scheduleData.reason}
                            onChange={e => setScheduleData({ ...scheduleData, reason: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500"
                            placeholder="Ex: Cliente pediu para ligar mais tarde..."
                          />
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>

              {isFillingReport && (
                <footer className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                  <button onClick={handleSubmitReport} disabled={isProcessing} className="px-12 py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center gap-3 active:scale-95 transition-all disabled:opacity-50">
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />} Salvar e Próximo
                  </button>
                </footer>
              )}
            </div>
          ) : (
            <div className="h-full bg-slate-50 border-4 border-dashed border-slate-100 rounded-[56px] flex flex-col items-center justify-center p-20 text-center gap-6 opacity-30">
              <Phone size={64} className="text-slate-300" />
              <p className="text-sm font-black uppercase text-slate-400 tracking-widest">Aguardando início do atendimento</p>
            </div>
          )}
        </div>

        {
          isSkipModalOpen && (
            <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                  <h3 className="text-xl font-black uppercase tracking-tighter">
                    {isCalling ? 'Pular Chamada em Curso' : 'Motivo do Pulo'}
                  </h3>
                  <button onClick={() => setIsSkipModalOpen(false)}><X size={24} /></button>
                </div>
                <div className="p-8 space-y-3">
                  {SKIP_REASONS.map(reason => (
                    <button
                      key={reason}
                      onClick={() => handleSelectSkipReason(reason)} // Update handler
                      disabled={isProcessing}
                      className="w-full p-5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl text-left font-black uppercase text-[10px] tracking-widest text-slate-700 transition-all active:scale-95 flex justify-between items-center group"
                    >
                      {reason}
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                  <button
                    onClick={handleMoveToWhatsApp}
                    className="w-full p-5 mb-3 bg-green-50 hover:bg-green-100 border border-green-100 rounded-2xl text-left font-black uppercase text-[10px] tracking-widest text-green-700 transition-all active:scale-95 flex justify-between items-center group"
                  >
                    Mover para WhatsApp
                    <MessageCircle size={14} className="text-green-300 group-hover:text-green-600 transition-all" />
                  </button>
                  <button onClick={() => setIsSkipModalOpen(false)} className="w-full py-4 mt-2 text-[9px] font-black uppercase text-slate-300 tracking-widest hover:text-red-500 transition-colors">Cancelar Operação</button>
                </div>
              </div>
            </div>
          )
        }

        {/* MODAL DE REAGENDAMENTO OBRIGATÓRIO (REPIQUE) */}
        {isRescheduleModalOpen && (
          <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="bg-orange-600 p-8 text-white text-center">
                <Clock size={48} className="mx-auto mb-4 text-orange-200" />
                <h3 className="text-2xl font-black uppercase tracking-tighter">Agendar Repique</h3>
                <p className="text-orange-100 font-bold mt-2">Defina o próximo passo para este atendimento</p>
              </div>

              <div className="px-10 pt-8 pb-4">
                <label className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl cursor-pointer hover:bg-emerald-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={whatsappCheck}
                    onChange={e => setWhatsappCheck(e.target.checked)}
                    className="w-6 h-6 text-emerald-600 rounded-lg focus:ring-emerald-500"
                  />
                  <span className="font-black text-emerald-800 uppercase text-xs tracking-widest flex items-center gap-2">
                    <MessageCircle size={18} /> Enviei WhatsApp para o cliente
                  </span>
                </label>
              </div>

              <div className="p-10 grid grid-cols-2 gap-4">
                <button onClick={() => confirmRescheduleSkip('1d')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">1 Dia</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Amanhã</span>
                </button>
                <button onClick={() => confirmRescheduleSkip('2d')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">2 Dias</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Depois de amanhã</span>
                </button>
                <button onClick={() => confirmRescheduleSkip('1w')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">1 Semana</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Próxima semana</span>
                </button>
                <button onClick={() => confirmRescheduleSkip('1m')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">1 Mês</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Próximo mês</span>
                </button>
              </div>

              <div className="pb-10 px-10 space-y-4">
                {whatsappCheck && (
                  <button
                    onClick={handleWhatsappOnly}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-emerald-500 active:scale-95 transition-all"
                  >
                    Encerrar sem Agendar (Só WhatsApp)
                  </button>
                )}

                <button onClick={() => setIsRescheduleModalOpen(false)} className="w-full text-center text-slate-400 font-bold text-xs hover:text-red-500 uppercase tracking-widest">
                  Cancelar (Voltar)
                </button>
              </div>
            </div>
          </div>
        )}
      </div >
    </>
  );
};

export default Queue;
