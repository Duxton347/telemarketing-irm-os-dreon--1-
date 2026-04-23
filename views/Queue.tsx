
import React from 'react';
import { QuestionnaireForm } from '../components/QuestionnaireForm';
import {
  Phone, PhoneOff, SkipForward, Play, CheckCircle2,
  Loader2, Clock, MapPin, User, FileText, AlertCircle, Save, X, MessageCircle, Copy, Check, ChevronRight, AlertTriangle, ClipboardList, Zap, Calendar, Mail, Globe
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Task, Client, Question, CallType, OperatorEventType, ProtocolStatus, UserRole, ClientTag, ClientHistoryData } from '../types';
import { SKIP_REASONS, PROTOCOL_SLA } from '../constants';
import { TagApprovalCard } from '../components/TagApprovalCard';
import { HelpTooltip } from '../components/HelpTooltip';
import { PortfolioCategoryBrowser } from '../components/PortfolioCategoryBrowser';
import { HELP_TEXTS } from '../utils/helpTexts';
import { buildQuestionnaireTextSummary, enrichQuestionnaireResponses } from '../utils/questionnaireInsights';
import { buildScheduledForValue } from '../utils/scheduleDateTime';
import { getTaskAssignableUsers } from '../utils/taskAssignment';
import { supabase } from '../lib/supabase';
import {
  buildPortfolioCategoryGroups,
  collectPortfolioMetadata,
  getClientPortfolioEntries,
  getOperatorPriorityPortfolioEntries
} from '../utils/clientPortfolio';

interface QueueProps {
  user: any;
}

type SkipFlowMode = 'direct' | 'repique';

const EMPTY_CLIENT_HISTORY: ClientHistoryData = {
  calls: [],
  protocols: [],
  summary: {
    totalCalls: 0,
    totalProtocols: 0,
    openProtocols: 0,
    callCountsByType: [],
    callCountsByPurpose: [],
    callCountsByTargetProduct: []
  }
};

const FUNNEL_STAGE_ORDER = ['NEW', 'CONTACT_ATTEMPT', 'CONTACT_MADE', 'QUALIFIED', 'PROPOSAL_SENT', 'PHYSICAL_VISIT'];

const getFunnelStageIndex = (stage?: string) => {
  const index = FUNNEL_STAGE_ORDER.indexOf(stage || 'NEW');
  return index >= 0 ? index : 0;
};

const getWebsiteUrl = (website?: string) => {
  const value = String(website || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const Queue: React.FC<QueueProps> = ({ user }) => {
  const [effectiveOperatorId, setEffectiveOperatorId] = React.useState<string>(user.id);
  const [operators, setOperators] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (user.role === UserRole.ADMIN) {
      dataService.getUsers().then(users => {
        setOperators(
          getTaskAssignableUsers(users).filter(operator => operator.id !== user.id)
        );
      }).catch(e => console.error("Error fetching operators:", e));
    }
  }, [user.id, user.role]);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [currentTask, setCurrentTask] = React.useState<Task | null>(null);
  const [client, setClient] = React.useState<Client | null>(null);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [responses, setResponses] = React.useState<Record<string, any>>({});
  const [callSummary, setCallSummary] = React.useState('');
  const [crmStatus, setCrmStatus] = React.useState('');
  const [interestProduct, setInterestProduct] = React.useState('');

  const [isCalling, setIsCalling] = React.useState(false);
  const [isFillingReport, setIsFillingReport] = React.useState(false);
  const [isSkipModalOpen, setIsSkipModalOpen] = React.useState(false);
  const [callDuration, setCallDuration] = React.useState(0);
  const [reportDuration, setReportDuration] = React.useState(0);
  const [startTime, setStartTime] = React.useState<string | null>(null);
  const [isCopied, setIsCopied] = React.useState(false);
  const [isCopiedSecondary, setIsCopiedSecondary] = React.useState(false);
  const [isCopiedResponsible, setIsCopiedResponsible] = React.useState(false);
  const [hasRecentCall, setHasRecentCall] = React.useState(false);
  const [recentCallWindowDays, setRecentCallWindowDays] = React.useState(3);
  const [expandedPortfolioCategory, setExpandedPortfolioCategory] = React.useState<string | null>(null);

  const [clientHistory, setClientHistory] = React.useState<ClientHistoryData>(EMPTY_CLIENT_HISTORY);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [campaignFeedback, setCampaignFeedback] = React.useState({
    portfolioScope: '',
    offerInterestLevel: '',
    offerBlockerReason: ''
  });
  const clientPortfolioEntries = React.useMemo(() => getClientPortfolioEntries(client), [client]);
  const operatorPriorityPortfolioEntries = React.useMemo(
    () => getOperatorPriorityPortfolioEntries(clientPortfolioEntries),
    [clientPortfolioEntries]
  );
  const clientPortfolioMetadata = React.useMemo(
    () => collectPortfolioMetadata(operatorPriorityPortfolioEntries),
    [operatorPriorityPortfolioEntries]
  );
  const operatorPortfolioCategoryGroups = React.useMemo(
    () => buildPortfolioCategoryGroups(operatorPriorityPortfolioEntries),
    [operatorPriorityPortfolioEntries]
  );

  // Estados para abertura de protocolo no report
  const [needsProtocol, setNeedsProtocol] = React.useState(false);
  const [protoData, setProtoData] = React.useState({
    title: '',
    departmentId: 'atendimento',
    priority: 'MÃƒÂ©dia' as 'Baixa' | 'MÃƒÂ©dia' | 'Alta'
  });

  // Scheduling State
  const [scheduleData, setScheduleData] = React.useState({
    isScheduling: false,
    date: '',
    time: '',
    reason: '',
    type: CallType.POS_VENDA
  });

  // Dreon Skill v3: Tag Suggestion State
  const [suggestedTags, setSuggestedTags] = React.useState<ClientTag[]>([]);
  const [showTagSuccess, setShowTagSuccess] = React.useState(false);

  // Sync schedule type with current task
  React.useEffect(() => {
    if (currentTask) {
      setScheduleData(prev => ({ ...prev, type: currentTask.type }));
      setCampaignFeedback({
        portfolioScope: currentTask.portfolioScope || (currentTask.targetProduct ? 'somente_linha_alvo' : ''),
        offerInterestLevel: '',
        offerBlockerReason: ''
      });
    }
  }, [currentTask]);

  React.useEffect(() => {
    if (operatorPortfolioCategoryGroups.length === 0) {
      setExpandedPortfolioCategory(null);
      return;
    }

    setExpandedPortfolioCategory(current =>
      current && operatorPortfolioCategoryGroups.some(group => group.category === current)
        ? current
        : null
    );
  }, [operatorPortfolioCategoryGroups, client?.id]);

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
    setIsCopied(false);
    setIsCopiedSecondary(false);
    setIsCopiedResponsible(false);
    setHasRecentCall(false);
    setExpandedPortfolioCategory(null);
    setNeedsProtocol(false);
    setProtoData({ title: '', departmentId: 'atendimento', priority: 'MÃƒÂ©dia' });
    setScheduleData({ isScheduling: false, date: '', time: '', reason: '', type: CallType.POS_VENDA });
    setCrmStatus('');
    setInterestProduct('');
    setSuggestedTags([]);
    setShowTagSuccess(false);
    setClientHistory(EMPTY_CLIENT_HISTORY);
    setCampaignFeedback({ portfolioScope: '', offerInterestLevel: '', offerBlockerReason: '' });
  }, []);

  // State for upcoming tasks
  const [upcomingTasks, setUpcomingTasks] = React.useState<Task[]>([]);
  const [queueRefreshPending, setQueueRefreshPending] = React.useState(false);
  const realtimeRefreshTimeoutRef = React.useRef<number | null>(null);

  const fetchQueue = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [allTasks, allQuestionsRaw, allClients, blockDays] = await Promise.all([
        dataService.getTasks(effectiveOperatorId),
        dataService.getQuestions(), // We'll filter later or fetch specific
        dataService.getClients(true), // Pass TRUE to include LEADS (Prospects)
        dataService.getCommunicationBlockDays()
      ]);
      setRecentCallWindowDays(blockDays);
      resetState();

      const now = new Date();
      // Filter out tasks that are waiting for approval
      const myPendingTasks = allTasks.filter(t =>
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
        // Try normal client lookup first, then use embedded task data as fallback
        let foundClient = allClients.find(c => c.id === myTask.clientId) || null;

        // Fallback: build a Client object from embedded task data (for LEADs / Prospects)
        if (!foundClient && (myTask.clientName || myTask.clientPhone || myTask.clients)) {
          const embeddedClient = myTask.clients as any;
          foundClient = {
            id: myTask.clientId,
            name: myTask.clientName || embeddedClient?.name || 'Prospecto',
            phone: myTask.clientPhone || embeddedClient?.phone || '',
            address: embeddedClient?.address || '',
            items: embeddedClient?.items || [],
            offers: embeddedClient?.offers || [],
            acceptance: embeddedClient?.acceptance || 'medium',
            satisfaction: embeddedClient?.satisfaction || 'medium',
            origin: embeddedClient?.origin,
            email: embeddedClient?.email,
            website: embeddedClient?.website,
            status: embeddedClient?.status || 'LEAD',
            responsible_phone: embeddedClient?.responsible_phone,
            buyer_name: embeddedClient?.buyer_name,
            interest_product: embeddedClient?.interest_product,
            preferred_channel: embeddedClient?.preferred_channel,
            funnel_status: embeddedClient?.funnel_status,
            customer_profiles: embeddedClient?.customer_profiles || [],
            product_categories: embeddedClient?.product_categories || [],
            equipment_models: embeddedClient?.equipment_models || embeddedClient?.items || [],
            portfolio_entries: embeddedClient?.portfolio_entries || []
          } as Client;
        }

        const filteredQuestions = await dataService.getQuestions(
          myTask.type as CallType,
          (myTask as any).proposito,
          {
            clientContext: foundClient || undefined,
            campaignContext: {
              campaignName: myTask.campaignName,
              targetProduct: myTask.targetProduct,
              offerProduct: myTask.offerProduct,
              portfolioScope: myTask.portfolioScope,
              campaignMode: myTask.campaignMode
            }
          }
        );
        setQuestions(filteredQuestions);

        setCurrentTask(myTask);
        setClient(foundClient);

        if (foundClient) {
          const recent = await dataService.checkRecentCall(foundClient.id);
          setHasRecentCall(recent);
          // Set initial values
          setCrmStatus(foundClient.funnel_status || '');
          setInterestProduct(foundClient.interest_product || '');

          setHistoryLoading(true);
          try {
            const hist = await dataService.getClientHistory(foundClient.id);
            setClientHistory(hist);
          } catch (e) { console.error('Error fetching history', e); }
          setHistoryLoading(false);
        }
      } else {
        setQuestions(allQuestionsRaw);
        setCurrentTask(null);
        setClient(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOperatorId, resetState]);

  React.useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const scheduleRealtimeQueueRefresh = React.useCallback(() => {
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      if (isCalling || isFillingReport || isProcessing) {
        setQueueRefreshPending(true);
        return;
      }

      fetchQueue();
    }, 250);
  }, [fetchQueue, isCalling, isFillingReport, isProcessing]);

  React.useEffect(() => {
    if (!queueRefreshPending || isCalling || isFillingReport || isProcessing) return;

    setQueueRefreshPending(false);
    fetchQueue();
  }, [fetchQueue, isCalling, isFillingReport, isProcessing, queueRefreshPending]);

  React.useEffect(() => {
    const affectsOperator = (payload: any, assigneeKey: 'assigned_to' | 'assigned_operator_id') => {
      const newAssignee = String(payload?.new?.[assigneeKey] || '').trim();
      const oldAssignee = String(payload?.old?.[assigneeKey] || '').trim();
      return newAssignee === effectiveOperatorId || oldAssignee === effectiveOperatorId;
    };

    const queueChannel = supabase
      .channel(`queue-refresh:${effectiveOperatorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks'
      }, payload => {
        if (affectsOperator(payload, 'assigned_to')) {
          scheduleRealtimeQueueRefresh();
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_schedules'
      }, payload => {
        if (affectsOperator(payload, 'assigned_operator_id')) {
          scheduleRealtimeQueueRefresh();
        }
      })
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      supabase.removeChannel(queueChannel);
    };
  }, [effectiveOperatorId, scheduleRealtimeQueueRefresh]);

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

  // New state for Skip-Reschedule flow
  const [skipReasonSelected, setSkipReasonSelected] = React.useState<string | null>(null);
  const [skipFlowMode, setSkipFlowMode] = React.useState<SkipFlowMode>('direct');
  const [whatsappCheck, setWhatsappCheck] = React.useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = React.useState(false);
  const [manualRepDate, setManualRepDate] = React.useState('');
  const [manualRepTime, setManualRepTime] = React.useState('09:00');

  const resetSkipFlowState = () => {
    setIsSkipModalOpen(false);
    setIsRescheduleModalOpen(false);
    setSkipReasonSelected(null);
    setSkipFlowMode('direct');
    setWhatsappCheck(false);
    setManualRepDate('');
    setManualRepTime('09:00');
  };

  const openSkipFlow = (mode: SkipFlowMode = 'direct') => {
    setSkipReasonSelected(null);
    setSkipFlowMode(mode);
    setWhatsappCheck(false);
    setManualRepDate('');
    setManualRepTime('09:00');
    setIsRescheduleModalOpen(false);
    setIsSkipModalOpen(true);
  };

  const buildFinalSkipReason = (reason: string) => {
    const skipTimingStr = isCalling ? '[APÃƒâ€œS INICIAR] ' : '[ANTES DA CHAMADA] ';
    return `${skipTimingStr}${reason}`;
  };

  const handleDirectSkip = async (reason?: string, reopenModal: 'skip' | 'repique' = 'skip') => {
    if (!currentTask) return;

    const selectedReason = reason || skipReasonSelected || 'Pulo Direto';
    const finalSkipReason = buildFinalSkipReason(selectedReason);

    if (!confirm("Tem certeza que deseja pular SEM agendar um retorno? O contato poderÃƒÂ¡ ficar perdido.")) {
      if (reopenModal === 'skip') {
        setIsSkipModalOpen(true);
      } else {
        setIsRescheduleModalOpen(true);
      }
      return;
    }

    setIsProcessing(true);
    try {
      await dataService.updateTask(currentTask.id, { status: 'skipped', skipReason: finalSkipReason });
      await dataService.logOperatorEvent(user.id, OperatorEventType.PULAR_ATENDIMENTO, currentTask.id, `Pulo (Sem Repique) - Motivo: ${finalSkipReason}`);
      await fetchQueue();
      resetSkipFlowState();
    } catch (e: any) {
      console.error('Erro ao pular:', e);
      alert(`Erro ao pular: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipDuringCall = () => {
    openSkipFlow();
  };

  const handleCopyPhone = () => {
    if (client) {
      navigator.clipboard.writeText(client.phone);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleCopyPhoneSecondary = () => {
    if (client && client.phone_secondary) {
      navigator.clipboard.writeText(client.phone_secondary);
      setIsCopiedSecondary(true);
      setTimeout(() => setIsCopiedSecondary(false), 2000);
    }
  };

  const handleCopyResponsiblePhone = () => {
    if (client && client.responsible_phone) {
      navigator.clipboard.writeText(client.responsible_phone);
      setIsCopiedResponsible(true);
      setTimeout(() => setIsCopiedResponsible(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    if (client) {
      const phone = client.phone.replace(/\D/g, '');
      const url = `https://wa.me/55${phone}`;
      window.open(url, '_blank');
    }
  };

  const handleWhatsAppSecondary = () => {
    if (client && client.phone_secondary) {
      const phone = client.phone_secondary.replace(/\D/g, '');
      const url = `https://wa.me/55${phone}`;
      window.open(url, '_blank');
    }
  };

  const handleWhatsAppResponsible = () => {
    if (client && client.responsible_phone) {
      const phone = client.responsible_phone.replace(/\D/g, '');
      if (!phone) return;
      const url = `https://wa.me/55${phone}`;
      window.open(url, '_blank');
    }
  };

  const handleLogWhatsApp = async () => {
    if (!currentTask || !client) return;
    if (!confirm("Registrar interaÃƒÂ§ÃƒÂ£o via WhatsApp e finalizar esta tarefa?")) return;

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
      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id);
      await fetchQueue();
      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id);
      await fetchQueue();
      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id, 'InteraÃƒÂ§ÃƒÂ£o WhatsApp');
      await fetchQueue();
      alert("InteraÃƒÂ§ÃƒÂ£o registrada!");
    } catch (e) {
      alert("Erro ao registrar WhatsApp.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveToWhatsApp = async () => {
    if (!currentTask) return;
    if (!confirm("Mover este atendimento para a fila do WhatsApp? A chamada atual serÃƒÂ¡ encerrada/pulada.")) return;

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

  const handleSelectSkipReason = async (reason: string) => {
    setSkipReasonSelected(reason);
    setIsSkipModalOpen(false);

    // If reason implies a wrong or non-existent number, automatically skip and flag as invalid
    const isInvalidNumber = reason.toLowerCase().includes('nÃƒÂ£o existe') || reason.toLowerCase().includes('errado') || reason.toLowerCase().includes('invÃƒÂ¡lido');

    if (isInvalidNumber && client && currentTask) {
        setIsProcessing(true);
        try {
            await dataService.updateClientFields(client.id, { invalid: true });

            const skipTimingStr = isCalling ? '[APÃƒâ€œS INICIAR] ' : '[ANTES DA CHAMADA] ';
            const finalSkipReason = buildFinalSkipReason(reason);

            await dataService.updateTask(currentTask.id, { status: 'skipped', skipReason: finalSkipReason });
            await dataService.logOperatorEvent(user.id, OperatorEventType.PULAR_ATENDIMENTO, currentTask.id, `Marcado como Telefone InvÃƒÂ¡lido: ${finalSkipReason}`);

            alert("Cliente marcado com telefone incorreto. Ele foi removido das filas e enviado para o relatÃƒÂ³rio de revisÃƒÂ£o.");
            await fetchQueue();
            resetSkipFlowState();
        } catch (e) {
            console.error(e);
            alert("Erro ao marcar cliente como invÃƒÂ¡lido.");
        } finally {
            setIsProcessing(false);
        }
        return; // Bypass reschedule modal
    }

    if (skipFlowMode === 'direct') {
      await handleDirectSkip(reason);
      return;
    }

    setIsRescheduleModalOpen(true);
    setWhatsappCheck(false); // Reset check
  };

  const confirmRescheduleSkip = async (interval: '1d' | '2d' | '1w' | '1m' | 'manual', manualDate?: string, manualTime?: string) => {
    if (!currentTask || !skipReasonSelected) return;

    setIsProcessing(true);

    try {
      const skipTimingStr = isCalling ? '[APÃƒâ€œS INICIAR] ' : '[ANTES DA CHAMADA] ';
      const finalSkipReason = buildFinalSkipReason(skipReasonSelected);

      let date: Date;
      if (interval === 'manual' && manualDate) {
        date = new Date(buildScheduledForValue(manualDate, manualTime));
      } else {
        date = new Date();
        if (interval === '1d') date.setDate(date.getDate() + 1);
        else if (interval === '2d') date.setDate(date.getDate() + 2);
        else if (interval === '1w') date.setDate(date.getDate() + 7);
        else if (interval === '1m') date.setMonth(date.getMonth() + 1);
        date.setHours(9, 0, 0, 0);
      }

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
          responses: { 
            call_type: CallType.WHATSAPP, 
            note: `Registrado via Pulo de Atendimento: ${finalSkipReason}`,
            written_report: `Pulo com WhatsApp - Motivo: ${finalSkipReason}`
          },
          type: CallType.WHATSAPP,
        });
      }

      // 2. Create Schedule Request (Scenario B & C)
      await dataService.createScheduleRequest({
        requestedByOperatorId: user.id,
        assignedOperatorId: user.id,
        customerId: currentTask.clientId,
        originCallId: null, // No call record exists when skipping
        scheduledFor: date.toISOString(),
        callType: currentTask.type,
        scheduleReason: currentTask.scheduleReason || finalSkipReason,
        status: 'PENDENTE_APROVACAO',
        skipReason: finalSkipReason,
        whatsappSent: whatsappCheck,
        hasRepick: true
      });

      // 3. Mark current task as skipped
      await dataService.updateTask(currentTask.id, {
        status: 'skipped',
        skipReason: finalSkipReason,
      });

      await dataService.logOperatorEvent(user.id, OperatorEventType.PULAR_ATENDIMENTO, currentTask.id, `${finalSkipReason} (Reagendado para ${date.toLocaleDateString()} - WhatsApp: ${whatsappCheck ? 'Sim' : 'NÃƒÂ£o'})`);
      await fetchQueue();
    } catch (e: any) {
      console.error('Erro no repique:', e);
      alert(`Erro ao solicitar reagendamento: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
      resetSkipFlowState();
    }
  };

  const handleWhatsappOnly = async () => {
    if (!currentTask || !client) return;
    if (!whatsappCheck) {
      alert("Marque a opÃƒÂ§ÃƒÂ£o de WhatsApp para confirmar que houve comunicaÃƒÂ§ÃƒÂ£o.");
      return;
    }

    if (!confirm("Confirmar que houve contato WhatsApp e finalizar SEM agendar novo retorno?")) return;

    setIsProcessing(true);
    try {
      const skipTimingStr = isCalling ? '[APÃƒâ€œS INICIAR] ' : '[ANTES DA CHAMADA] ';
      const finalSkipReason = buildFinalSkipReason(skipReasonSelected || 'Pulo com WhatsApp');

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
        responses: { 
          call_type: CallType.WHATSAPP, 
          note: `Finalizado via Pulo (SÃƒÂ³ WhatsApp) - ${finalSkipReason}`,
          written_report: `Pulo com WhatsApp (Direto) - Motivo: ${finalSkipReason}`
        },
        type: CallType.WHATSAPP,
      });

      // Complete Task
      await dataService.updateTask(currentTask.id, { status: 'completed', skipReason: finalSkipReason });

      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id, `Pulo com WhatsApp (Sem Repique) - Motivo: ${finalSkipReason}`);
      await fetchQueue();
    } catch (e) {
      alert("Erro ao finalizar.");
    } finally {
      setIsProcessing(false);
      resetSkipFlowState();
    }
  };

  const handleSubmitReport = async () => {
    if (!currentTask || !client) return;

    if (needsProtocol && !protoData.title.trim()) {
      alert("Informe um tÃƒÂ­tulo para o protocolo.");
      return;
    }

    if (scheduleData.isScheduling && (!scheduleData.date || !scheduleData.time)) {
      alert("Informe a data e hora para o agendamento.");
      return;
    }

    setIsProcessing(true);
    try {
      const initialFunnelStatus = client.funnel_status || 'NEW';
      const selectedFunnelStatus = (crmStatus || initialFunnelStatus) as Client['funnel_status'];
      const selectedInterestProduct = interestProduct.trim();
      const hasManualFunnelChange = Boolean(
        client.status === 'LEAD'
        && selectedFunnelStatus
        && selectedFunnelStatus !== initialFunnelStatus
      );
      const hasManualInterestProductChange = Boolean(
        client.status === 'LEAD'
        && selectedInterestProduct
        && selectedInterestProduct !== (client.interest_product || '')
      );
      const hasUpsellSignal = Boolean(
        campaignFeedback.offerInterestLevel
        || campaignFeedback.offerBlockerReason
        || responses.offer_interest_level
        || responses.upsell_interesse_produto
        || responses.upsell_offer
      );
      const shouldApplyAttemptFallback = Boolean(
        client.status === 'LEAD'
        && !hasManualFunnelChange
        && !hasManualInterestProductChange
        && !hasUpsellSignal
        && getFunnelStageIndex(initialFunnelStatus) <= getFunnelStageIndex('CONTACT_ATTEMPT')
      );

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
          description: callSummary || 'Protocolo aberto via finalizaÃƒÂ§ÃƒÂ£o de chamada.',
          priority: protoData.priority,
          status: ProtocolStatus.ABERTO,
          openedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          slaDueAt: new Date(now.getTime() + slaHours * 3600000).toISOString()
        };
        await dataService.saveProtocol(p as any, user.id);
      }

      // 1.5 Schedule Logic
      if (scheduleData.isScheduling) {
        const scheduleDate = new Date(`${scheduleData.date}T${scheduleData.time}:00`).toISOString();
        await dataService.createScheduleRequest({
          requestedByOperatorId: user.id,
          assignedOperatorId: user.id,
          customerId: client.id,
          originCallId: undefined,
          scheduledFor: scheduleDate,
          callType: scheduleData.type || currentTask.type,
          scheduleReason: scheduleData.reason || 'Agendado durante finalizaÃƒÂ§ÃƒÂ£o de chamada',
          status: 'PENDENTE_APROVACAO',
        });
      }

      // 2. Save Call Record
      const baseResponses = enrichQuestionnaireResponses(
        {
          ...responses,
          call_type: currentTask.type,
          interest_product: selectedInterestProduct || responses.interest_product,
          target_product: currentTask.targetProduct,
          offer_product: currentTask.offerProduct,
          portfolio_scope: campaignFeedback.portfolioScope || currentTask.portfolioScope,
          offer_interest_level: campaignFeedback.offerInterestLevel,
          offer_blocker_reason: campaignFeedback.offerBlockerReason,
          campaign_name: currentTask.campaignName,
          call_purpose: currentTask.proposito
        },
        questions,
        currentTask.type,
        currentTask.proposito,
        { clientContext: client || undefined, responses }
      );
      const questionnaireTextSummary = buildQuestionnaireTextSummary(
        baseResponses,
        questions,
        currentTask.type,
        currentTask.proposito,
        { clientContext: client || undefined, responses: baseResponses }
      );
      const finalWrittenReport = callSummary.trim() || questionnaireTextSummary || '';
      const normalizedResponses = {
        ...baseResponses,
        written_report: finalWrittenReport,
        questionnaire_text_summary: questionnaireTextSummary || undefined
      };
      const callData = {
        id: '',
        taskId: currentTask.id,
        operatorId: user.id,
        clientId: client.id,
        startTime: startTime!,
        endTime: new Date().toISOString(),
        duration: callDuration,
        reportTime: reportDuration,
        responses: normalizedResponses,
        type: currentTask.type,
        proposito: currentTask.proposito,
        campanha_id: currentTask.campanha_id,
        campaignName: currentTask.campaignName,
        targetProduct: currentTask.targetProduct,
        offerProduct: currentTask.offerProduct,
        portfolioScope: campaignFeedback.portfolioScope || currentTask.portfolioScope,
        campaignMode: currentTask.campaignMode,
        offerInterestLevel: campaignFeedback.offerInterestLevel,
        offerBlockerReason: campaignFeedback.offerBlockerReason
      };
      const result = await dataService.saveCall(callData);

      // Mark task as completed so it leaves the queue
      await dataService.updateTask(currentTask.id, { status: 'completed' });

      const clientCrmUpdates: Partial<Client> = {};
      if (hasManualFunnelChange) {
        clientCrmUpdates.funnel_status = selectedFunnelStatus;
      } else if (shouldApplyAttemptFallback) {
        clientCrmUpdates.funnel_status = 'CONTACT_ATTEMPT';
      }
      if (hasManualInterestProductChange) {
        clientCrmUpdates.interest_product = selectedInterestProduct;
      }
      if (Object.keys(clientCrmUpdates).length > 0) {
        await dataService.updateClientFields(client.id, clientCrmUpdates);
      }

      await dataService.logOperatorEvent(user.id, OperatorEventType.FINALIZAR_ATENDIMENTO, currentTask.id);
      await fetchQueue();

      // Handle Tag Suggestions sem travar a proxima chamada
      if (result.suggestedTags && result.suggestedTags.length > 0) {
        setSuggestedTags(result.suggestedTags);
        setShowTagSuccess(true);
      }
    } catch (e) {
      console.error('Erro ao salvar relatorio:', e);
      alert("Erro ao salvar relatÃƒÂ³rio.");
    }    finally { setIsProcessing(false); }
  };

  const renderAdminSelector = () => {
    if (user.role !== UserRole.ADMIN) return null;
    return (
      <div className="mb-6 bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-slate-200 w-full">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
          <User size={24} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Visualizar Carga por UsuÃƒÂ¡rio</p>
          <select
            value={effectiveOperatorId}
            onChange={(e) => setEffectiveOperatorId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <option value={user.id}>Eu mesmo (Admin)</option>
            {operators.map(op => (
              <option key={op.id} value={op.id}>{op.name} (@{op.username})</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  if (isLoading) return (
    <div className="h-full flex flex-col items-center p-8">
      {renderAdminSelector()}
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    </div>
  );

  if (!currentTask || !client) {
    return (
      <div className="flex flex-col h-full w-full">
        {renderAdminSelector()}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-20 bg-white rounded-[56px] border border-dashed border-slate-200 min-h-[500px]">
          <Phone size={48} className="text-slate-200" />
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Nenhuma chamada pendente</h3>
          {upcomingTasks.length > 0 && (
            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 flex flex-col items-center gap-2 max-w-md">
              <Clock className="text-orange-500" size={24} />
              <p className="font-bold text-slate-600 text-center">VocÃƒÂª tem <strong className="text-orange-600">{upcomingTasks.length}</strong> agendamentos futuros na fila.</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Eles aparecerÃƒÂ£o aqui no horÃƒÂ¡rio agendado.</p>
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
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {renderAdminSelector()}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 pb-20">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 rounded-[48px] p-10 text-white shadow-2xl space-y-8 relative overflow-hidden">
            {hasRecentCall && (
              <div className="absolute top-0 left-0 w-full bg-red-600 text-white py-2 px-4 text-center animate-pulse flex items-center justify-center gap-2">
                <AlertTriangle size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">AtenÃƒÂ§ÃƒÂ£o: comunicaÃƒÂ§ÃƒÂ£o registrada nos ÃƒÂºltimos {recentCallWindowDays} dia(s)</span>
              </div>
            )}

            <div className={hasRecentCall ? 'pt-6' : ''}>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{currentTask.type}</span>
                {client.status === 'INATIVO' && (
                  <span className="px-3 py-1 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle size={10} /> CLIENTE INATIVO
                  </span>
                )}
              </div>
              <h3 className="text-3xl font-black mt-4 tracking-tighter uppercase">{client.name}</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-400 flex items-center gap-2">
                  <Phone size={18} />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-slate-500 tracking-widest leading-none mb-1">PrimÃƒÂ¡rio</span>
                    <span>{client.phone}</span>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={handleCopyPhone} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
                    {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                  <button onClick={handleWhatsApp} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-all">
                    <MessageCircle size={16} />
                  </button>
                </div>
              </div>

              {client.phone_secondary && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/50">
                  <div className="font-bold text-slate-400 flex items-center gap-2">
                    <Phone size={18} />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-slate-500 tracking-widest leading-none mb-1">SecundÃƒÂ¡rio</span>
                      <span>{client.phone_secondary}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={handleCopyPhoneSecondary} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
                      {isCopiedSecondary ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                    <button onClick={handleWhatsAppSecondary} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-all">
                      <MessageCircle size={16} />
                    </button>
                  </div>
                </div>
              )}

              {(client.street || client.neighborhood || client.city) ? (
                <div className="flex items-start gap-2 mt-4 font-bold text-slate-400">
                  <MapPin size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm">{client.street || ''}</p>
                    <p className="text-sm">{client.neighborhood || ''}{client.city ? ` - ${client.city}` : ''} {client.state ? `/ ${client.state}` : ''}</p>
                    <p className="text-xs text-slate-500 mt-1">CEP: {client.zip_code || 'N/A'}</p>
                  </div>
                </div>
              ) : (
                <p className="font-bold text-slate-400 flex items-start gap-2 mt-4"><MapPin size={18} className="shrink-0" /> {client.address || 'Sem endereÃƒÂ§o'}</p>
              )}
              {client.last_purchase_date && (
                <div className="mt-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">ÃƒÅ¡ltima Compra</p>
                  <p className="font-black text-amber-400 text-sm flex items-center gap-2">
                    <Calendar size={16} /> {client.last_purchase_date}
                  </p>
                </div>
              )}
              {(currentTask.type === 'PROSPECÃƒâ€¡ÃƒÆ’O' || client.status === 'LEAD') && client.buyer_name && (
                <p className="font-bold text-emerald-400 flex items-center gap-2 text-sm mt-2"><User size={16} className="shrink-0" /> Decisor: {client.buyer_name}</p>
              )}
              {(currentTask.type === 'PROSPECÃƒâ€¡ÃƒÆ’O' || client.status === 'LEAD') && client.responsible_phone && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/50">
                  <div className="font-bold text-blue-400 flex items-center gap-2 text-sm">
                    <Phone size={16} className="shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-slate-500 tracking-widest leading-none mb-1">Responsavel</span>
                      <span>{client.responsible_phone}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={handleCopyResponsiblePhone} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
                      {isCopiedResponsible ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                    <button onClick={handleWhatsAppResponsible} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-all">
                      <MessageCircle size={16} />
                    </button>
                  </div>
                </div>
              )}
              {(currentTask.type === 'PROSPECÃƒâ€¡ÃƒÆ’O' || client.status === 'LEAD') && client.email && (
                <p className="font-bold text-amber-400 flex items-center gap-2 text-sm mt-1"><Mail size={16} className="shrink-0 text-amber-400" /> {client.email}</p>
              )}
              {client.website && (
                <a
                  href={getWebsiteUrl(client.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-cyan-300 hover:text-cyan-200 flex items-center gap-2 text-sm mt-1 underline underline-offset-4"
                >
                  <Globe size={16} className="shrink-0" />
                  Acessar site do cliente
                </a>
              )}
              {!historyLoading && clientHistory.protocols.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Protocolos no nome do cliente</p>
                  <div className="space-y-2">
                    {clientHistory.protocols.slice(0, 3).map(protocol => (
                      <div key={protocol.id} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[8px] font-black uppercase tracking-widest text-red-300">{protocol.status}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">#{protocol.protocolNumber || protocol.id.substring(0, 8)}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-200">{protocol.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(currentTask.type === 'PROSPECÃƒâ€¡ÃƒÆ’O' || client.status === 'LEAD') && (
              <div className="pt-6 border-t border-slate-800">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Origem do Lead</p>
                    <span className="px-3 py-1 bg-slate-800 text-[10px] font-black uppercase text-slate-300 rounded-md border border-slate-700">{client.origin || 'Sistema'}</span>
                  </div>
                  {client.interest_product && (
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Produto de Interesse</p>
                      <span className="px-3 py-1 bg-emerald-900/50 text-[10px] font-black uppercase text-emerald-400 rounded-md border border-emerald-800">{client.interest_product}</span>
                    </div>
                  )}
                  {client.funnel_status && (() => {
                    const STATUS_LABELS: Record<string, string> = {
                      'NEW': 'Novo Lead', 'CONTACT_ATTEMPT': 'Tentativa de Contato',
                      'CONTACT_MADE': 'Contato Feito', 'QUALIFIED': 'Qualificado',
                      'PROPOSAL_SENT': 'Proposta Enviada', 'PHYSICAL_VISIT': 'Visita FÃƒÂ­sica'
                    };
                    return (
                      <div className="flex-1">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Status do Lead</p>
                        <span className="px-3 py-1 bg-blue-900/50 text-[10px] font-black uppercase text-blue-400 rounded-md border border-blue-800">{STATUS_LABELS[client.funnel_status] || client.funnel_status}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-slate-800">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Perfil e Base TÃƒÂ©cnica do Cliente</p>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {clientPortfolioMetadata.customer_profiles.map((profile, profileIndex) => (
                    <span key={`queue-profile-${client.id}-${profile}-${profileIndex}`} className="px-3 py-1.5 bg-amber-900/30 text-[10px] font-black uppercase text-amber-300 rounded-xl border border-amber-800/70">{profile}</span>
                  ))}
                  {clientPortfolioMetadata.customer_profiles.length === 0 && (
                    <span className="text-xs text-slate-600 italic">Nenhum perfil priorizado encontrado</span>
                  )}
                </div>

                <PortfolioCategoryBrowser
                  title="Categorias e Equipamentos Prioritarios"
                  description="Os produtos ficam ocultos ate voce abrir a categoria desejada."
                  groups={operatorPortfolioCategoryGroups}
                  expandedCategory={expandedPortfolioCategory}
                  onToggleCategory={(category) => setExpandedPortfolioCategory(current => current === category ? null : category)}
                  emptyCategoryLabel="Nenhuma categoria prioritaria encontrada"
                  emptySelectionLabel="Clique em uma categoria para ver os produtos relacionados."
                  theme="dark"
                />
              </div>
            </div>

            {/* HISTÃƒâ€œRICO DE INTERAÃƒâ€¡Ãƒâ€¢ES */}
            <div className="pt-6 border-t border-slate-800">
              <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4"><FileText size={14} className="text-slate-400" /> HistÃƒÂ³rico de Contatos Recentes</h5>
              {!historyLoading && (
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Ligacoes</p>
                      <p className="mt-1 text-lg font-black text-white">{clientHistory.summary.totalCalls}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Protocolos</p>
                      <p className="mt-1 text-lg font-black text-white">{clientHistory.summary.totalProtocols}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Abertos</p>
                      <p className="mt-1 text-lg font-black text-white">{clientHistory.summary.openProtocols}</p>
                    </div>
                  </div>
                  {clientHistory.summary.callCountsByType.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Contagem por tipo</p>
                      <div className="flex flex-wrap gap-2">
                        {clientHistory.summary.callCountsByType.map(item => (
                          <span key={item.key} className="px-2 py-1 rounded-lg bg-slate-800 text-[8px] font-black uppercase text-slate-300 border border-slate-700">
                            {item.label}: {item.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {clientHistory.summary.callCountsByPurpose.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Contagem por proposito</p>
                      <div className="flex flex-wrap gap-2">
                        {clientHistory.summary.callCountsByPurpose.map(item => (
                          <span key={item.key} className="px-2 py-1 rounded-lg bg-blue-950/40 text-[8px] font-black uppercase text-blue-300 border border-blue-900/60">
                            {item.label}: {item.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {clientHistory.summary.callCountsByTargetProduct.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Contagem por produto/oferta</p>
                      <div className="flex flex-wrap gap-2">
                        {clientHistory.summary.callCountsByTargetProduct.map(item => (
                          <span key={item.key} className="px-2 py-1 rounded-lg bg-emerald-950/30 text-[8px] font-black uppercase text-emerald-300 border border-emerald-900/50">
                            {item.label}: {item.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {historyLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-600" size={16} /></div>
              ) : clientHistory.calls.length > 0 ? (
                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {clientHistory.calls.map(call => (
                    <div key={call.id} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-700 text-slate-300 rounded">{call.type}</span>
                        <span className="text-[8px] font-black text-slate-400 uppercase">{new Date(call.startTime).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {(call.proposito || call.targetProduct || call.offerProduct) && (
                        <div className="flex flex-wrap gap-2">
                          {call.proposito && <span className="px-2 py-0.5 bg-blue-950/40 text-blue-300 rounded text-[8px] font-black uppercase border border-blue-900/60">{call.proposito}</span>}
                          {call.targetProduct && <span className="px-2 py-0.5 bg-cyan-950/40 text-cyan-300 rounded text-[8px] font-black uppercase border border-cyan-900/60">{call.targetProduct}</span>}
                          {call.offerProduct && <span className="px-2 py-0.5 bg-emerald-950/30 text-emerald-300 rounded text-[8px] font-black uppercase border border-emerald-900/50">{call.offerProduct}</span>}
                        </div>
                      )}
                      <p className="text-[10px] font-bold text-slate-300 italic">"{call.responses?.written_report || call.responses?.questionnaire_text_summary || call.responses?.justificativa || call.responses?.note || 'Sem anotaÃƒÂ§ÃƒÂµes.'}"</p>
                      {call.responses?.questionnaire_text_summary && call.responses?.questionnaire_text_summary !== call.responses?.written_report && (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Respostas de escrita</p>
                          <pre className="mt-1 whitespace-pre-wrap text-[10px] font-medium text-slate-300">{call.responses.questionnaire_text_summary}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-800/20 p-4 rounded-xl border border-slate-800 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Op. InÃƒÂ©dita - Primeiro Contato</p>
                </div>
              )}
            </div>
          </div>

          {!isCalling && !isFillingReport && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleStartCall} className="py-6 bg-blue-600 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                <Play size={20} /> Iniciar
              </button>
              <button onClick={() => openSkipFlow()} disabled={isProcessing} className="py-6 bg-slate-200 text-slate-600 rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-sm flex items-center justify-center gap-3 hover:bg-slate-300 active:scale-95 transition-all">
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
                    <p className="text-xl font-black">{isFillingReport ? 'Preenchendo RelatÃƒÂ³rio' : 'LigaÃƒÂ§ÃƒÂ£o em Curso'}</p>
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
                  proposito={(currentTask as any).proposito}
                  clientContext={client || undefined}
                />

                {(currentTask.proposito || currentTask.targetProduct || currentTask.offerProduct || currentTask.campaignMode === 'RELATIONSHIP') && (
                  <section className="space-y-4 p-8 bg-slate-50 rounded-[40px] border border-slate-100">
                    <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                      <Zap size={18} className="text-cyan-500" /> Contexto da Campanha
                    </h5>
                    <div className="flex flex-wrap gap-3">
                      {currentTask.campaignMode === 'RELATIONSHIP' && (
                        <span className="px-4 py-2 bg-violet-100 text-violet-700 rounded-2xl text-[10px] font-black uppercase border border-violet-200">
                          Campanha relacional sem oferta especÃƒÂ­fica
                        </span>
                      )}
                      {currentTask.proposito && (
                        <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-2xl text-[10px] font-black uppercase border border-blue-200">
                          PropÃƒÂ³sito: {currentTask.proposito}
                        </span>
                      )}
                      {currentTask.targetProduct && (
                        <span className="px-4 py-2 bg-cyan-100 text-cyan-700 rounded-2xl text-[10px] font-black uppercase border border-cyan-200">
                          Linha alvo: {currentTask.targetProduct}
                        </span>
                      )}
                      {currentTask.offerProduct && (
                        <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-2xl text-[10px] font-black uppercase border border-emerald-200">
                          Oferta: {currentTask.offerProduct}
                        </span>
                      )}
                    </div>
                  </section>
                )}

                <section className="space-y-4">
                  <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                    <FileText size={18} className="text-blue-600" /> Resumo da Conversa
                  </h5>
                  <textarea value={callSummary} onChange={e => setCallSummary(e.target.value)} className="w-full p-8 bg-slate-50 rounded-[40px] border border-slate-100 font-bold text-slate-800 h-48 outline-none resize-none focus:ring-8 focus:ring-blue-500/5 transition-all" placeholder="O que foi conversado? Anote detalhes importantes para o prÃƒÂ³ximo contato." />
                </section>

                {/* PRODUTO DE INTERESSE E FUNIL (CRM) - Somente para ligaÃƒÂ§ÃƒÂµes de prospecÃƒÂ§ÃƒÂ£o */}
                {isFillingReport && (currentTask.type === 'PROSPECÃƒâ€¡ÃƒÆ’O' || client.status === 'LEAD') && (
                  <section className="space-y-6 pt-6 border-t border-slate-100">
                    <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                      <User size={18} className="text-emerald-500" /> Atualizar InformaÃƒÂ§ÃƒÂµes do Lead (CRM)
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-emerald-50/30 p-8 rounded-[40px] border border-emerald-100/50">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status do Funil (CRM)</label>
                        <select
                          className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-700 text-sm border border-slate-200 focus:border-emerald-500 transition-all cursor-pointer"
                          value={crmStatus || 'NEW'}
                          onChange={e => setCrmStatus(e.target.value)}
                        >
                          <option value="NEW">Novo Lead</option>
                          <option value="CONTACT_ATTEMPT">Tentativa de Contato</option>
                          <option value="CONTACT_MADE">Contato Feito</option>
                          <option value="QUALIFIED">Qualificado</option>
                          <option value="PROPOSAL_SENT">Proposta Enviada</option>
                          <option value="PHYSICAL_VISIT">Visita FÃƒÂ­sica</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Produto de Interesse</label>
                        <select
                          className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-700 text-sm border border-slate-200 focus:border-emerald-500 transition-all cursor-pointer"
                          value={interestProduct}
                          onChange={e => setInterestProduct(e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          <option value="Fotovoltaico">Fotovoltaico</option>
                          <option value="Bomba">Bomba</option>
                          <option value="Pressurizadora">Pressurizadora</option>
                          <option value="QuÃƒÂ­micos">QuÃƒÂ­micos</option>
                          <option value="Gerador de Cloro">Gerador de Cloro</option>
                          <option value="Aquecedor de Piscina">Aquecedor de Piscina</option>
                          <option value="Aquecedor a GÃƒÂ¡s">Aquecedor a GÃƒÂ¡s</option>
                          <option value="Boiler">Boiler</option>
                          <option value="Placa Solar">Placa Solar</option>
                          <option value="ManutenÃƒÂ§ÃƒÂ£o">ManutenÃƒÂ§ÃƒÂ£o</option>
                          <option value="Outros">Outros</option>
                        </select>
                      </div>
                    </div>
                  </section>
                )}

                {isFillingReport && (currentTask.targetProduct || currentTask.offerProduct) && (
                  <section className="space-y-6 pt-6 border-t border-slate-100">
                    <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                      <ClipboardList size={18} className="text-cyan-500" /> MÃƒÂ©tricas da Oferta e da Linha
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-cyan-50/40 p-8 rounded-[40px] border border-cyan-100/70">
                      {currentTask.targetProduct && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Escopo do retorno no pÃƒÂ³s-venda</label>
                          <select
                            className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-700 text-sm border border-slate-200 focus:border-cyan-500 transition-all cursor-pointer"
                            value={campaignFeedback.portfolioScope}
                            onChange={e => setCampaignFeedback(prev => ({ ...prev, portfolioScope: e.target.value }))}
                          >
                            <option value="">Selecione...</option>
                            <option value="somente_linha_alvo">Somente a linha da ligaÃƒÂ§ÃƒÂ£o</option>
                            <option value="mais_de_uma_linha">Mais de uma linha do cliente</option>
                            <option value="todas_as_linhas">Refere-se a todas as linhas</option>
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">NÃƒÂ­vel de receptividade</label>
                        <select
                          className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-700 text-sm border border-slate-200 focus:border-cyan-500 transition-all cursor-pointer"
                          value={campaignFeedback.offerInterestLevel}
                          onChange={e => setCampaignFeedback(prev => ({ ...prev, offerInterestLevel: e.target.value }))}
                        >
                          <option value="">Selecione...</option>
                          <option value="ALTO">Alto</option>
                          <option value="MEDIO">MÃƒÂ©dio</option>
                          <option value="BAIXO">Baixo</option>
                          <option value="SEM_INTERESSE">Sem interesse</option>
                        </select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Principal impeditivo para compra/adesÃƒÂ£o</label>
                        <input
                          type="text"
                          value={campaignFeedback.offerBlockerReason}
                          onChange={e => setCampaignFeedback(prev => ({ ...prev, offerBlockerReason: e.target.value }))}
                          className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-700 text-sm border border-slate-200 focus:border-cyan-500 transition-all"
                          placeholder="Ex: PreÃƒÂ§o, prazo, sem urgÃƒÂªncia, jÃƒÂ¡ possui estoque..."
                        />
                      </div>
                    </div>
                  </section>
                )}


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
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TÃƒÂ­tulo do Protocolo</label>
                          <input
                            type="text"
                            value={protoData.title}
                            onChange={e => setProtoData({ ...protoData, title: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500"
                            placeholder="Ex: ReclamaÃƒÂ§ÃƒÂ£o de atraso na bomba..."
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Setor ResponsÃƒÂ¡vel</label>
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
                            <option value="MÃƒÂ©dia">MÃƒÂ©dia</option>
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
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Agendamento RÃƒÂ¡pido</label>
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
                              +1 MÃƒÂªs
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
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HorÃƒÂ¡rio</label>
                          <input
                            type="time"
                            value={scheduleData.time}
                            onChange={e => setScheduleData({ ...scheduleData, time: e.target.value })}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:border-orange-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GÃƒÂªnero da LigaÃƒÂ§ÃƒÂ£o</label>
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
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />} Salvar e PrÃƒÂ³ximo
                  </button>
                </footer>
              )}
            </div>
          ) : (
            <div className="h-full bg-slate-50 border-4 border-dashed border-slate-100 rounded-[56px] flex flex-col items-center justify-center p-20 text-center gap-6 opacity-30">
              <Phone size={64} className="text-slate-300" />
              <p className="text-sm font-black uppercase text-slate-400 tracking-widest">Aguardando inÃƒÂ­cio do atendimento</p>
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
                  <button onClick={resetSkipFlowState}><X size={24} /></button>
                </div>
                <div className="p-8 space-y-3">
                  <div className="grid grid-cols-2 gap-3 pb-2">
                    <button
                      onClick={() => setSkipFlowMode('direct')}
                      className={`p-4 rounded-2xl border text-left transition-all ${skipFlowMode === 'direct' ? 'bg-red-50 border-red-400 text-red-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">Pular</span>
                      <span className="block mt-1 text-[11px] font-bold">Sem retorno</span>
                    </button>
                    <button
                      onClick={() => setSkipFlowMode('repique')}
                      className={`p-4 rounded-2xl border text-left transition-all ${skipFlowMode === 'repique' ? 'bg-orange-50 border-orange-400 text-orange-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">Repique</span>
                      <span className="block mt-1 text-[11px] font-bold">Abrir agendamento</span>
                    </button>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2">
                    {skipFlowMode === 'direct'
                      ? 'Ao escolher o motivo, o atendimento serÃƒÂ¡ pulado sem criar repique.'
                      : 'Ao escolher o motivo, vamos abrir as opÃƒÂ§ÃƒÂµes de repique.'}
                  </p>
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
                  <button onClick={() => setIsSkipModalOpen(false)} className="w-full py-4 mt-2 text-[9px] font-black uppercase text-slate-300 tracking-widest hover:text-red-500 transition-colors">Cancelar OperaÃƒÂ§ÃƒÂ£o</button>
                </div>
              </div>
            </div>
          )
        }

        {/* MODAL DE REAGENDAMENTO OBRIGATÃƒâ€œRIO (REPIQUE) */}
        {isRescheduleModalOpen && (
          <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="bg-orange-600 p-8 text-white text-center">
                <Clock size={48} className="mx-auto mb-4 text-orange-200" />
                <h3 className="text-2xl font-black uppercase tracking-tighter">Agendar Repique</h3>
                <p className="text-orange-100 font-bold mt-2">Defina o prÃƒÂ³ximo passo para este atendimento</p>
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
                  <span className="text-[9px] font-bold uppercase text-slate-400">AmanhÃƒÂ£</span>
                </button>
                <button onClick={() => confirmRescheduleSkip('2d')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">2 Dias</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Depois de amanhÃƒÂ£</span>
                </button>
                <button onClick={() => confirmRescheduleSkip('1w')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">1 Semana</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">PrÃƒÂ³xima semana</span>
                </button>
                <button onClick={() => confirmRescheduleSkip('1m')} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] hover:border-orange-500 hover:bg-orange-50 transition-all group">
                  <span className="block text-xl font-black text-slate-800 group-hover:text-orange-600 mb-1">1 MÃƒÂªs</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">PrÃƒÂ³ximo mÃƒÂªs</span>
                </button>
              </div>

              {/* Manual Date/Time Picker */}
              <div className="px-10 pb-6 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ou escolha uma data especÃƒÂ­fica:</p>
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={manualRepDate}
                    onChange={e => setManualRepDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-orange-500 transition-all"
                  />
                  <input
                    type="time"
                    value={manualRepTime}
                    onChange={e => setManualRepTime(e.target.value)}
                    className="w-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-orange-500 transition-all"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!manualRepDate) { alert('Selecione uma data.'); return; }
                    confirmRescheduleSkip('manual', manualRepDate, manualRepTime);
                  }}
                  disabled={!manualRepDate}
                  className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-orange-400 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Calendar size={16} className="inline mr-2" />Solicitar Repique na Data Selecionada
                </button>
              </div>

              <div className="pb-10 px-10 space-y-4">
                <button
                  onClick={async () => {
                    if (whatsappCheck) {
                      await handleWhatsappOnly();
                    } else {
                      if (!confirm("Tem certeza que deseja pular SEM agendar um retorno? O contato poderÃƒÂ¡ ficar perdido.")) return;
                      setIsProcessing(true);
                      try {
                        const skipTimingStr = isCalling ? '[APÃƒâ€œS INICIAR] ' : '[ANTES DA CHAMADA] ';
                        const finalSkipReason = skipReasonSelected ? `${skipTimingStr}${skipReasonSelected}` : `${skipTimingStr}Pulo Direto`;
                        await dataService.updateTask(currentTask.id, { status: 'skipped', skipReason: finalSkipReason });
                        await dataService.logOperatorEvent(user.id, OperatorEventType.PULAR_ATENDIMENTO, currentTask.id, `Pulo (Sem Repique) - Motivo: ${finalSkipReason}`);
                        await fetchQueue();
                      } catch (e) { alert("Erro ao pular."); }
                      finally { setIsProcessing(false); setIsRescheduleModalOpen(false); }
                    }
                  }}
                  className={`w-full py-4 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all ${whatsappCheck ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-500 hover:bg-red-400'}`}
                >
                  {whatsappCheck ? 'Encerrar sem Agendar (SÃƒÂ³ WhatsApp)' : 'Pular Definitivamente (Sem Retorno)'}
                </button>

                <button onClick={() => setIsRescheduleModalOpen(false)} className="w-full text-center text-slate-400 font-bold text-xs hover:text-red-500 uppercase tracking-widest">
                  Cancelar (Voltar)
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal de Sucesso e Tags Sugeridas (Dreon Skill v3) */}
        {showTagSuccess && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[100] p-6">
            <div className="bg-white rounded-[48px] p-10 max-w-4xl w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
              <div className="text-center space-y-4 mb-10">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={40} />
                </div>
                <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">RelatÃƒÂ³rio Salvo com Sucesso!</h3>
                <p className="text-slate-500 font-bold max-w-md mx-auto">
                  Detectamos as seguintes intenÃƒÂ§ÃƒÂµes (tags) durante a conversa. 
                  <strong className="text-blue-600"> Confirme as corretas</strong> para ajudar a IA a aprender.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar p-2">
                {suggestedTags.map(tag => (
                  <TagApprovalCard 
                    key={tag.id} 
                    tag={tag} 
                    onUpdated={(updatedTag) => {
                      setSuggestedTags(current =>
                        current.map(currentTag => currentTag.id === updatedTag.id ? updatedTag : currentTag)
                      );
                    }}
                    operatorId={user.id} 
                    isSupervisor={false} 
                  />
                ))}
              </div>

              <div className="mt-10 flex justify-center">
                <button 
                  onClick={() => {
                    setShowTagSuccess(false);
                    setSuggestedTags([]);
                  }}
                  className="px-12 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                >
                  PrÃƒÂ³xima Chamada <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Queue;
