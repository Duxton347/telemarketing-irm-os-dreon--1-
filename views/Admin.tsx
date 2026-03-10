
import React from 'react';
import {
  Upload, Users, FileSpreadsheet, X, UserPlus, CheckCircle2,
  Loader2, Info, AlertCircle, Clock, Database, Trash2, Save,
  MessageSquarePlus, ChevronUp, ChevronDown, Trash, Edit3, RotateCcw,
  PhoneOff, RefreshCw, ListFilter, Plus, UserCheck, UserMinus, Phone, PlayCircle, ChevronRight, LayoutList, Eraser, Sparkles, BarChart3, MessageCircle, Settings, Search, AlertTriangle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { User, UserRole, CallType, Question, Task, ScheduleStatus, ProductivityMetrics, WhatsAppTask } from '../types';
import { RepiqueModal, RepiqueData } from '../components/RepiqueModal';

interface AdminProps {
  user?: User;
}

const Admin: React.FC<AdminProps> = ({ user }) => {
  const [activeTab, setActiveTab] = React.useState<'import' | 'users' | 'questions' | 'skips' | 'tasks' | 'settings'>('questions');
  const [googleMapsKey, setGoogleMapsKey] = React.useState('');
  const [users, setUsers] = React.useState<User[]>([]);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [skippedTasks, setSkippedTasks] = React.useState<Task[]>([]);
  const [pendingTasks, setPendingTasks] = React.useState<Task[]>([]);
  const [pendingWhatsAppTasks, setPendingWhatsAppTasks] = React.useState<WhatsAppTask[]>([]);
  const [skippedWhatsAppTasks, setSkippedWhatsAppTasks] = React.useState<WhatsAppTask[]>([]);
  const [taskFilterChannel, setTaskFilterChannel] = React.useState<'VOICE' | 'WHATSAPP'>('VOICE');
  const [isTypeModalOpen, setIsTypeModalOpen] = React.useState(false);
  const [taskToEditType, setTaskToEditType] = React.useState<any>(null);
  const [csvPreview, setCsvPreview] = React.useState<any[]>([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = React.useState(false);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = React.useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = React.useState({ date: '', time: '' });


  // Repique State
  const [isRepiqueModalOpen, setIsRepiqueModalOpen] = React.useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [isProcessingRepique, setIsProcessingRepique] = React.useState(false);

  // Deduplication State
  const [duplicateClients, setDuplicateClients] = React.useState<any[]>([]);

  const [userData, setUserData] = React.useState({ name: '', username: '', password: '', role: UserRole.OPERATOR });
  const [questionData, setQuestionData] = React.useState<Partial<Question>>({ text: '', options: [], type: 'ALL' as any, stageId: '' });

  const [selectedOperatorId, setSelectedOperatorId] = React.useState<string>('');
  const [selectedCallType, setSelectedCallType] = React.useState<CallType>(CallType.POS_VENDA);

  const refreshData = async () => {
    setIsProcessing(true);
    try {
      const [userList, questionList, taskList, allClients, whatsappList, mapsKey] = await Promise.all([
        dataService.getUsers(),
        dataService.getQuestions(),
        dataService.getTasks(),
        dataService.getClients(true), // Include LEADs (Prospects)
        dataService.getWhatsAppTasks(),
        dataService.getSystemSetting('GOOGLE_MAPS_KEY')
      ]);
      setUsers(userList);
      setQuestions(questionList);
      setGoogleMapsKey(mapsKey);

      const skipped = taskList.filter(t => t.status === 'skipped').map(t => ({
        ...t,
        client: allClients.find(c => c.id === t.clientId) || { name: t.clientName || 'Prospecto', phone: t.clientPhone || '' }
      }));
      setSkippedTasks(skipped);

      const skippedWa = whatsappList.filter(t => t.status === 'skipped').map(t => ({
        ...t,
        client: allClients.find(c => c.id === t.clientId) || { name: t.clientName, phone: t.clientPhone },
        operator: userList.find(u => u.id === t.assignedTo)
      }));
      setSkippedWhatsAppTasks(skippedWa);

      const pending = taskList.filter(t => t.status === 'pending').map(t => ({
        ...t,
        client: allClients.find(c => c.id === t.clientId) || { name: t.clientName || 'Prospecto', phone: t.clientPhone || '' },
        operator: userList.find(u => u.id === t.assignedTo)
      }));
      setPendingTasks(pending);

      const pendingWa = whatsappList.filter(t => t.status === 'pending' || t.status === 'started').map(t => ({
        ...t,
        client: allClients.find(c => c.id === t.clientId) || { name: t.clientName, phone: t.clientPhone },
        operator: userList.find(u => u.id === t.assignedTo)
      }));
      setPendingWhatsAppTasks(pendingWa);

      const operators = userList.filter(u => u.role === UserRole.OPERATOR || u.role === UserRole.SUPERVISOR);
      if (operators.length > 0 && !selectedOperatorId) {
        setSelectedOperatorId(operators[0].id);
      }

      // Load Metrics if on analytics tab (or initial load?)
      // distinct function for metrics to avoid heavy load every refresh?
      // For simplicity, load here or via effect when tab changes.
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };



  React.useEffect(() => { refreshData(); }, []);

  const handleDeleteTask = async (id: string) => {
    if (!confirm("Confirmar exclusão permanente desta tarefa da fila?")) return;

    setDeletingId(id);

    try {
      if (taskFilterChannel === 'WHATSAPP') {
        const previousWaTasks = [...pendingWhatsAppTasks];
        setPendingWhatsAppTasks(prev => prev.filter(t => t.id !== id));
        await dataService.deleteWhatsAppTask(id);
      } else {
        const previousTasks = [...pendingTasks];
        setPendingTasks(prev => prev.filter(t => t.id !== id));
        await dataService.deleteTask(id);
      }
    } catch (e: any) {
      console.error("Erro ao deletar:", e);
      // Restore appropriate state
      if (taskFilterChannel === 'WHATSAPP') refreshData();
      else refreshData();
      alert(`Erro na exclusão: ${e.message || 'Desconhecido'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearOperatorTasks = async () => {
    if (!selectedOperatorId) return alert("Selecione um operador no menu suspenso primeiro.");

    const operatorName = users.find(u => u.id === selectedOperatorId)?.name || 'selecionado';
    if (!confirm(`ATENÇÃO: Deseja apagar TODAS as pendências da fila de ${operatorName}? Esta ação limpará duplicadas e pulados. É irreversível.`)) return;

    setIsProcessing(true);
    // Limpeza imediata local para evitar lag visual
    const targetOpId = selectedOperatorId;

    try {
      if (taskFilterChannel === 'WHATSAPP') {
        setPendingWhatsAppTasks(prev => prev.filter(t => t.assignedTo !== targetOpId));
        await dataService.deleteWhatsAppTasksByOperator(targetOpId);
      } else {
        setPendingTasks(prev => prev.filter(t => t.assignedTo !== targetOpId));
        setSkippedTasks(prev => prev.filter(t => t.assignedTo !== targetOpId));
        await dataService.deleteTasksByOperator(targetOpId);
      }
      alert("Fila limpa com sucesso no servidor e localmente!");
      await refreshData();
    } catch (e: any) {
      alert(`Erro ao limpar fila no banco de dados: ${e.message}`);
      await refreshData(); // Restaura caso falhe
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeduplicate = async () => {
    setIsProcessing(true);
    try {
      const removedCount = await dataService.deleteDuplicateTasks();
      alert(`${removedCount} tarefas duplicadas foram removidas com sucesso!`);
      await refreshData();
    } catch (e: any) {
      alert(`Erro na deduplicação: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateUser = async (id: string, updates: Partial<User>) => {
    setIsProcessing(true);
    try {
      await dataService.updateUser(id, updates);
      await refreshData();
    } catch (e) {
      alert("Erro ao atualizar usuário.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await dataService.createUser(userData);
      setIsUserModalOpen(false);
      setUserData({ name: '', username: '', password: '', role: UserRole.OPERATOR });
      await refreshData();
      alert("Usuário criado com sucesso!");
    } catch (e) {
      alert("Erro ao criar usuário.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionData.text || !questionData.options || questionData.options.length === 0) return alert("Preencha o texto e ao menos uma opção.");

    setIsProcessing(true);
    try {
      await dataService.saveQuestion({ ...questionData, order: questionData.order || questions.length + 1 });
      setIsQuestionModalOpen(false);
      setQuestionData({ text: '', options: [], type: 'ALL' as any, stageId: '' });
      await refreshData();
    } catch (e) { alert("Erro ao salvar pergunta."); }
    finally { setIsProcessing(false); }
  };

  const handleUpdateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToEditType) return;

    setIsProcessing(true);
    try {
      if (taskFilterChannel === 'WHATSAPP') {
        const updates: any = { type: selectedCallType };
        if (selectedOperatorId) {
          updates.assigned_to = selectedOperatorId;
        }
        await dataService.updateWhatsAppTask(taskToEditType.id, updates);
      } else {
        // Voice tasks update
        if (selectedOperatorId) {
          await dataService.updateTask(taskToEditType.id, { type: selectedCallType, assignedTo: selectedOperatorId });
        } else {
          await dataService.updateTask(taskToEditType.id, { type: selectedCallType });
        }
      }
      setIsTypeModalOpen(false);
      setTaskToEditType(null);
      await refreshData();
      alert("Tarefa atualizada com sucesso!");
    } catch (e: any) {
      alert("Erro ao atualizar tarefa: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRescheduleTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaskId || !scheduleDate.date || !scheduleDate.time) return;

    setIsProcessing(true);
    // ... existing logic ...
    // Since I don't see the full body here in my view, I will just add the new handler after this block or before it. 
    // Wait, I can't replace partial function body comfortably without seeing it.
    // I'll insert handleUpdateType before handleRescheduleTask.


    setIsProcessing(true);
    try {
      const scheduledFor = `${scheduleDate.date}T${scheduleDate.time}:00`;
      await dataService.updateTask(editingTaskId, { scheduledFor, status: 'pending' });
      setIsTaskModalOpen(false);
      setEditingTaskId(null);
      await refreshData();
      alert("Tarefa reagendada com sucesso!");
    } catch (e) {
      alert("Erro ao reagendar tarefa.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openRescheduleModal = (task: Task) => {
    setEditingTaskId(task.id);
    const now = new Date();
    setScheduleDate({
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    setIsTaskModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let text = event.target?.result as string;
        text = text.replace(/^\uFEFF/, "");

        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 1) {
          alert("O arquivo está vazio.");
          return;
        }

        const firstLine = lines[0];
        const separator = firstLine.includes(';') ? ';' : ',';

        const normalizeHeader = (h: string) =>
          h.toLowerCase()
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, '');

        const headers = firstLine.split(separator).map(normalizeHeader);

        const nameIdx = headers.findIndex(h => ['nome', 'cliente', 'name', 'razao'].some(t => h.includes(t)));
        const phoneIdx = headers.findIndex(h => ['telefone', 'celular', 'phone', 'contato', 'tel'].some(t => h.includes(t)));
        const equipIdx = headers.findIndex(h => ['equipamento', 'item', 'equipment', 'modelo', 'produto'].some(t => h.includes(t)));
        const offerIdx = headers.findIndex(h => ['oferta', 'offer', 'promocao'].some(t => h.includes(t)));
        const addressIdx = headers.findIndex(h => ['endereco', 'address', 'local', 'rua', 'logradouro'].some(t => h.includes(t)));
        const dateIdx = headers.findIndex(h => ['data', 'ultima', 'ultimacompra', 'compra', 'date'].some(t => h.includes(t)));

        const finalNameIdx = nameIdx;
        const finalPhoneIdx = phoneIdx;
        const finalEquipIdx = equipIdx;
        const finalAddressIdx = addressIdx;
        const finalOfferIdx = offerIdx;
        const finalDateIdx = dateIdx;

        const rows = lines.slice(1).map(line => {
          let values: string[] = [];
          if (line.includes('"')) {
            // Use positive lookahead to split by separator only if followed by even number of quotes
            // This handles 'Field 1,"Field, 2",Field 3' correctly
            const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
            values = line.split(regex).map(v => v.replace(/^"|"$/g, '').trim());
          } else {
            values = line.split(separator).map(v => v.trim());
          }

          // Strict mapping with no fallbacks logic to avoid guessing wrong columns
          // If a column is missing in header, it stays empty.

          return {
            name: finalNameIdx !== -1 ? values[finalNameIdx] : '',
            phone: finalPhoneIdx !== -1 ? values[finalPhoneIdx] : '',
            address: finalAddressIdx !== -1 ? values[finalAddressIdx] : '',
            equipment: finalEquipIdx !== -1 ? values[finalEquipIdx] : '',
            offer: finalOfferIdx !== -1 ? values[finalOfferIdx] : '',
            lastPurchaseDate: finalDateIdx !== -1 ? values[finalDateIdx] : ''
          };
        }).filter(r => r.phone && r.phone.trim() !== '');

        if (rows.length === 0) {
          alert("Dados inválidos. Verifique a ordem: Nome, Telefone, Equipamento.");
          return;
        }

        setCsvPreview(rows);
      } catch (err) {
        console.error(err);
        alert("Erro ao ler arquivo.");
      }
    };
    reader.readAsText(file);
  };

  const [selectedChannel, setSelectedChannel] = React.useState<'VOICE' | 'WHATSAPP'>('VOICE');
  const [isImportingAsLead, setIsImportingAsLead] = React.useState(false);

  const runImport = async () => {
    if (csvPreview.length === 0 || isProcessing) return;
    if (!selectedOperatorId) {
      alert("Selecione um operador.");
      return;
    }

    setIsProcessing(true);
    try {
      let pendingByOpAndType: any[] = [];
      const allTasks = await dataService.getTasks(); // For VOICE check

      if (selectedChannel === 'VOICE') {
        pendingByOpAndType = allTasks.filter(t => t.status === 'pending' && t.type === selectedCallType);
      } else {
        // Fetch WhatsApp tasks for dup check
        // Note: getWhatsAppTasks filters by assignedTo if provided
        // But we might want 'pending' only? getWhatsAppTasks returns everything?
        // It returns everything for the operator.
        const waTasks = await dataService.getWhatsAppTasks(selectedOperatorId);
        pendingByOpAndType = waTasks.filter(t => t.status === 'pending' && t.type === selectedCallType);
      }

      let count = 0;
      for (const row of csvPreview) {

        const isProspecting = selectedCallType.includes('PROSPEC') || isImportingAsLead;
        const isReativacao = selectedCallType === CallType.REATIVACAO;

        const client = await dataService.upsertClient({
          name: row.name,
          phone: row.phone,
          address: row.address,
          items: row.equipment ? [row.equipment] : [],
          offers: row.offer ? [row.offer] : [],
          last_purchase_date: row.lastPurchaseDate,
          origin: isProspecting ? 'CSV_IMPORT' : 'MANUAL',
          status: isReativacao ? 'INATIVO' : (isProspecting ? 'LEAD' : 'CLIENT'),
          funnel_status: isProspecting ? 'NEW' : undefined
        });

        // Check duplicate
        const isDuplicateTask = pendingByOpAndType.some(t => t.clientId === client.id);
        if (isDuplicateTask) continue;

        // Check recent call ONLY for VOICE? Or both?
        // User didn't specify, but usually we don't want to spam even on WhatsApp if called recently?
        // Let's keep it for both for safety.
        const hasRecentCall = await dataService.checkRecentCall(client.id);
        if (hasRecentCall) continue;

        if (selectedChannel === 'VOICE') {
          await dataService.createTask({
            clientId: client.id,
            type: selectedCallType,
            assignedTo: selectedOperatorId
          });
        } else {
          await dataService.createWhatsAppTask({
            clientId: client.id,
            type: selectedCallType,
            assignedTo: selectedOperatorId,
            status: 'pending',
            source: 'manual'
          });
        }
        count++;
      }

      alert(`${count} tarefas importadas com sucesso para ${selectedChannel === 'VOICE' ? 'Ligação' : 'WhatsApp'}!`);
      setCsvPreview([]);
      await refreshData();
    } catch (e: any) {
      console.error(e);
      alert(`Erro na importação: ${e.message || JSON.stringify(e)}`);
    } finally { setIsProcessing(false); }
  };

  const handleRecoverTask = async (taskId: string) => {
    setIsProcessing(true);
    try {
      if (taskFilterChannel === 'WHATSAPP') {
        await dataService.updateWhatsAppTask(taskId, { status: 'pending', skip_reason: null, skip_note: null });
      } else {
        await dataService.updateTask(taskId, { status: 'pending' });
      }
      await refreshData();
      alert("Tarefa restaurada!");
    } catch (e) {
      alert("Erro ao restaurar.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await dataService.updateSystemSetting('GOOGLE_MAPS_KEY', googleMapsKey, 'Chave da API do Google Maps para o Scraper');
      alert("Configurações salvas com sucesso!");
    } catch (e: any) {
      alert("Erro ao salvar configurações: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanDuplicates = async () => {
    setIsProcessing(true);
    try {
      const dups = await dataService.findDuplicateClients();
      setDuplicateClients(dups);
      if (dups.length === 0) alert("Nenhum cliente duplicado encontrado!");
    } catch (e) {
      alert("Erro ao varrer clientes.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Gestão Operacional Dreon</h2>
          <p className="text-slate-500 text-sm font-medium">Controle total da plataforma.</p>
        </div>
        <button onClick={refreshData} disabled={isProcessing} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 transition-all disabled:opacity-50">
          <RefreshCw size={20} className={isProcessing ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-x-auto no-scrollbar">
        {[
          { id: 'questions', label: 'Questionário', icon: ListFilter },
          { id: 'import', label: 'Carga CSV', icon: FileSpreadsheet },
          { id: 'tasks', label: 'Fila de Trabalho', icon: LayoutList },
          { id: 'skips', label: 'Recuperar Pulados', icon: RotateCcw },
          { id: 'users', label: 'Equipe', icon: Users },
          { id: 'settings', label: 'Configurações', icon: Settings }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-3 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-300">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
            <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Gerenciar Fila Ativa</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Remova duplicatas ou limpe a fila inteira de um operador.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleDeduplicate}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 rounded-xl font-black uppercase text-[10px] shadow-sm hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30"
              >
                <Sparkles size={16} /> Limpar Todos os Duplicados
              </button>
              <select
                value={selectedOperatorId}
                onChange={e => setSelectedOperatorId(e.target.value)}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] uppercase outline-none"
              >
                <option value="">Operador alvo...</option>
                {users.filter(u => u.role !== UserRole.ADMIN).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button
                onClick={handleClearOperatorTasks}
                disabled={isProcessing || !selectedOperatorId}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-30"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Eraser size={16} />} Limpar Tudo do Operador
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => { setTaskFilterChannel('VOICE'); setSelectedTaskIds([]); }}
              className={`flex-1 p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${taskFilterChannel === 'VOICE' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
            >
              <Phone size={16} /> Fila de Ligações
            </button>
            <button
              onClick={() => { setTaskFilterChannel('WHATSAPP'); setSelectedTaskIds([]); }}
              className={`flex-1 p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${taskFilterChannel === 'WHATSAPP' ? 'bg-green-600 text-white border-green-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
            >
              <MessageCircle size={16} /> Fila do WhatsApp
            </button>
          </div>


          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-6 px-4">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        const tasks = taskFilterChannel === 'VOICE' ? pendingTasks : pendingWhatsAppTasks;
                        if (e.target.checked) setSelectedTaskIds(tasks.map((t: Task | WhatsAppTask) => t.id));
                        else setSelectedTaskIds([]);
                      }}
                      checked={(taskFilterChannel === 'VOICE' ? pendingTasks : pendingWhatsAppTasks).length > 0 && selectedTaskIds.length === (taskFilterChannel === 'VOICE' ? pendingTasks : pendingWhatsAppTasks).length}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Cliente</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Operador</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Tipo</th>

                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(taskFilterChannel === 'VOICE' ? pendingTasks : pendingWhatsAppTasks).map((task: any) => (
                  <tr key={task.id} className={`transition-all group ${selectedTaskIds.includes(task.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <td className="py-5 px-4">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTaskIds(prev => [...prev, task.id]);
                          else setSelectedTaskIds(prev => prev.filter(id => id !== task.id));
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-5 px-4">
                      <p className="font-black text-slate-800">{task.client?.name || 'Carregando...'}</p>
                      <p className="text-[10px] font-bold text-slate-400">{task.client?.phone}</p>
                    </td>
                    <td className="py-5 px-4">
                      <span className="text-xs font-bold text-slate-600">@{task.operator?.username || 'Desconhecido'}</span>
                    </td>
                    <td className="py-5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest">{task.type}</span>
                        <button
                          onClick={() => {
                            setTaskToEditType(task);
                            setSelectedCallType(task.type as CallType);
                            setSelectedOperatorId(''); // Reset selector to "Keep current"
                            setIsTypeModalOpen(true);
                          }}
                          className="p-1 text-slate-300 hover:text-blue-600 transition-colors"
                          title="Editar Tipo"
                        >
                          <Edit3 size={12} />
                        </button>
                      </div>
                    </td>

                    <td className="py-5 px-4 text-right">
                      <button
                        onClick={() => openRescheduleModal(task)}
                        className="w-12 h-12 inline-flex items-center justify-center bg-blue-100 text-blue-600 rounded-2xl hover:bg-blue-200 transition-all active:scale-95 mr-2"
                        title="Reagendar Tarefa"
                      >
                        <Clock size={20} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        disabled={deletingId === task.id}
                        className="w-12 h-12 inline-flex items-center justify-center bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-500/20 disabled:opacity-50"
                        title="Excluir tarefa permanentemente"
                      >
                        {deletingId === task.id ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {(taskFilterChannel === 'VOICE' ? pendingTasks : pendingWhatsAppTasks).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-slate-300 font-black uppercase text-xs tracking-widest">A fila de trabalho está vazia.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-2xl font-black text-slate-800">Equipe e Permissões</h3>
              <p className="text-xs text-slate-400 font-bold">Gerencie os acessos e funções dos colaboradores.</p>
            </div>
            <button onClick={() => setIsUserModalOpen(true)} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl flex items-center gap-2">
              <UserPlus size={18} /> Novo Usuário
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Colaborador</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Função</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-all">
                    <td className="py-6 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm">{u.name.charAt(0)}</div>
                        <div>
                          <p className="font-black text-slate-800">{u.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as UserRole })}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-tighter text-slate-700 outline-none"
                      >
                        {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="py-6 px-4">
                      <button
                        onClick={() => handleUpdateUser(u.id, { active: !u.active })}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${u.active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}
                      >
                        {u.active ? <><UserCheck size={14} /> Ativo</> : <><UserMinus size={14} /> Inativo</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-2xl font-black text-slate-800">Gerenciador de Questionário</h3>
              <p className="text-xs text-slate-400 font-bold">Configure as perguntas dinâmicas do sistema.</p>
            </div>
            <button onClick={() => { setQuestionData({ text: '', options: [], type: CallType.POS_VENDA }); setIsQuestionModalOpen(true); }} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl flex items-center gap-2">
              <MessageSquarePlus size={18} /> Nova Pergunta
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[32px] flex items-center gap-6 group hover:border-blue-200 transition-all">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">{q.type}</span>
                    <span className="text-slate-300 font-black text-[10px]">#ORDEM {q.order}</span>
                  </div>
                  <h4 className="font-black text-slate-800">{q.text}</h4>
                  <p className="text-xs text-slate-400 font-bold">{q.options.join(' • ')}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setQuestionData(q); setIsQuestionModalOpen(true); }} className="p-3 bg-white text-slate-400 hover:text-blue-600 rounded-xl shadow-sm"><Edit3 size={16} /></button>
                  <button onClick={async () => { if (confirm("Remover pergunta?")) { await dataService.deleteQuestion(q.id); refreshData(); } }} className="p-3 bg-white text-slate-400 hover:text-red-600 rounded-xl shadow-sm"><Trash size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10 animate-in fade-in duration-300">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Carga de Trabalho (CSV)</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Dica: Números contatados nos últimos 3 dias serão ignorados automaticamente.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1. Selecione o Operador Destinatário</label>
                <select
                  value={selectedOperatorId}
                  onChange={e => setSelectedOperatorId(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[11px] uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                >
                  <option value="">Selecione um operador...</option>
                  {users.filter(u => u.role === UserRole.OPERATOR || u.role === UserRole.SUPERVISOR).map(u => (
                    <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2. Canal de Atendimento</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setSelectedChannel('VOICE')}
                    className={`flex-1 p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${selectedChannel === 'VOICE' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                  >
                    <Phone size={16} /> Ligação
                  </button>
                  <button
                    onClick={() => setSelectedChannel('WHATSAPP')}
                    className={`flex-1 p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${selectedChannel === 'WHATSAPP' ? 'bg-green-600 text-white border-green-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                  >
                    <MessageCircle size={16} /> WhatsApp
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">3. Contexto da Campanha</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(CallType)
                    .filter(type => type !== CallType.WHATSAPP)
                    .map(type => (
                      <button
                        key={type}
                        onClick={() => setSelectedCallType(type)}
                        className={`p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedCallType === type ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                      >
                        {type}
                      </button>
                    ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">4. Escolha o Arquivo</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="p-12 border-4 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center gap-4 group-hover:bg-slate-50 group-hover:border-blue-100 transition-all">
                    <Upload className="text-slate-300 group-hover:text-blue-500 transition-colors" size={48} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clique ou arraste o arquivo CSV</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-[40px] p-8 border border-slate-100 flex flex-col h-[500px]">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Info size={14} /> Prévia dos Dados Identificados
              </h4>
              <div className="flex-1 overflow-auto custom-scrollbar">
                {csvPreview.length > 0 ? (
                  <table className="w-full text-left text-[10px] font-bold">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="pb-3 text-slate-400 uppercase tracking-widest">Cliente</th>
                        <th className="pb-3 text-slate-400 uppercase tracking-widest">Endereço</th>
                        <th className="pb-3 text-slate-400 uppercase tracking-widest">Equipamento</th>
                        <th className="pb-3 text-slate-400 uppercase tracking-widest">Oferta</th>
                        <th className="pb-3 text-slate-400 uppercase tracking-widest text-right">Telefone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {csvPreview.map((row, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-3 font-black text-slate-700">{row.name}</td>
                          <td className="py-3 text-[9px] text-slate-400 max-w-[150px] truncate" title={row.address}>{row.address || '-'}</td>
                          <td className="py-3 text-blue-600">{row.equipment || '-'}</td>
                          <td className="py-3 text-green-600">{row.offer || '-'}</td>
                          <td className="py-3 text-right text-slate-400 font-mono tracking-tighter">{row.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                    <FileSpreadsheet size={40} className="mb-4" />
                    <p className="uppercase font-black text-[9px] tracking-widest">Aguardando arquivo...</p>
                  </div>
                )}
              </div>
              {csvPreview.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-4 ml-1">
                    <input
                      type="checkbox"
                      id="isLead"
                      checked={isImportingAsLead}
                      onChange={(e) => setIsImportingAsLead(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="isLead" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                      Cadastrar este arquivo como LEADS? (Para funil de prospecção)
                    </label>
                  </div>

                  <button
                    onClick={runImport}
                    disabled={isProcessing}
                    className="mt-6 w-full py-6 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Database size={16} />}
                    Processar {csvPreview.length} Registros
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'skips' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-300">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Tarefas Puladas</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Recupere contatos que foram ignorados pelos operadores.</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => { setTaskFilterChannel('VOICE'); setSelectedTaskIds([]); }}
              className={`flex-1 p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${taskFilterChannel === 'VOICE' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
            >
              <Phone size={16} /> Fila de Ligações
            </button>
            <button
              onClick={() => { setTaskFilterChannel('WHATSAPP'); setSelectedTaskIds([]); }}
              className={`flex-1 p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${taskFilterChannel === 'WHATSAPP' ? 'bg-green-600 text-white border-green-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
            >
              <MessageCircle size={16} /> Fila do WhatsApp
            </button>
          </div>

          {(taskFilterChannel === 'VOICE' ? skippedTasks : skippedWhatsAppTasks).length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-6 opacity-30">
              <RotateCcw size={64} className="text-slate-300" />
              <p className="font-black uppercase text-xs tracking-widest text-slate-400">Nenhuma tarefa ignorada encontrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(taskFilterChannel === 'VOICE' ? skippedTasks : skippedWhatsAppTasks).map((task: any) => (
                <div key={task.id} className={`p-8 rounded-[32px] border flex flex-col justify-between group transition-all ${selectedTaskIds.includes(task.id) ? 'bg-blue-50 border-blue-300 shadow-md' : 'bg-slate-50 border-slate-100 hover:border-blue-200'}`}>
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-3 items-center">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.includes(task.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTaskIds(prev => [...prev, task.id]);
                            else setSelectedTaskIds(prev => prev.filter(id => id !== task.id));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">{task.type}</span>
                      </div>
                      <span className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1"><AlertCircle size={12} /> Pulado</span>
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-800 tracking-tighter">{task.client?.name || 'Cliente Desconhecido'}</h4>
                      <p className="text-xs font-bold text-slate-400 flex items-center gap-2 mt-1"><Phone size={14} className="text-blue-500" /> {task.client?.phone}</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Motivo informado:</p>
                      <p className="text-xs font-bold text-slate-700 italic">"{task.skipReason || 'Não informado'}"</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRecoverTask(task.id)}
                    disabled={isProcessing}
                    className="mt-8 w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-lg flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <PlayCircle size={14} /> Restaurar para Fila
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}



      {activeTab === 'settings' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10 animate-in fade-in duration-300">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Configurações do Sistema</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Parâmetros globais e chaves de API.</p>
          </div>

          <div className="max-w-3xl space-y-8">
            <div className="p-8 bg-slate-50 border border-slate-200 rounded-[32px] space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                  <Database size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-800">Google Maps API Integration</h4>
                  <p className="text-xs text-slate-500 font-medium mt-1">Necessário para o funcionamento do módulo de Captação (Scraper).</p>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Google Maps API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={googleMapsKey}
                      onChange={e => setGoogleMapsKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="flex-1 p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-8 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="animate-spin" /> : 'Salvar'}
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 pl-2">
                    <AlertCircle size={10} className="inline mr-1" />
                    Esta chave é armazenada de forma segura e usada apenas pelo Backend (Edge Function).
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isUserModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Novo Colaborador</h3>
              <button onClick={() => setIsUserModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateUser} className="p-8 space-y-4">
              <input type="text" placeholder="Nome Completo" required value={userData.name} onChange={e => setUserData({ ...userData, name: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              <input type="text" placeholder="Username (login)" required value={userData.username} onChange={e => setUserData({ ...userData, username: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              <input type="password" placeholder="Senha" required value={userData.password} onChange={e => setUserData({ ...userData, password: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              <select value={userData.role} onChange={e => setUserData({ ...userData, role: e.target.value as UserRole })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase">
                {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px]">Criar Usuário</button>
            </form>
          </div>
        </div>
      )}

      {isQuestionModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Questão Dinâmica</h3>
              <button onClick={() => setIsQuestionModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleSaveQuestion} className="p-8 space-y-4">
              <input type="text" placeholder="Texto da Pergunta" required value={questionData.text} onChange={e => setQuestionData({ ...questionData, text: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              <input type="text" placeholder="Opções (vire vírgula)" required value={questionData.options?.join(',')} onChange={e => setQuestionData({ ...questionData, options: e.target.value.split(',') })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              <select value={questionData.type} onChange={e => setQuestionData({ ...questionData, type: e.target.value as any })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase">
                {Object.values(CallType)
                  .filter(t => t !== CallType.WHATSAPP)
                  .map(t => <option key={t} value={t}>{t}</option>)}
                <option value="ALL">TODAS AS CATEGORIAS</option>
              </select>
              <button type="submit" className="w-full py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px]">Salvar Pergunta</button>
            </form>
          </div>
        </div>
      )}

      {isTaskModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Reagendar Tarefa</h3>
              <button onClick={() => setIsTaskModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleRescheduleTask} className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Data</label>
                <input type="date" required value={scheduleDate.date} onChange={e => setScheduleDate({ ...scheduleDate, date: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Horário</label>
                <input type="time" required value={scheduleDate.time} onChange={e => setScheduleDate({ ...scheduleDate, time: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
              </div>
              <button type="submit" disabled={isProcessing} className="w-full py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
                {isProcessing ? <Loader2 className="animate-spin" /> : <Clock size={16} />} Confirmar Agendamento
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-300">
          <div>
            <h3 className="text-2xl font-black text-slate-800">Manutenção e Configurações</h3>
            <p className="text-xs text-slate-400 font-bold">Gerencie dados e configurações do sistema.</p>
          </div>

          <div className="p-8 bg-blue-50/50 rounded-3xl border border-blue-100 space-y-6">
            <div>
              <h4 className="font-black text-slate-800 flex items-center gap-2"><Search size={18} className="text-blue-600" /> Varredura de Duplicados</h4>
              <p className="text-xs text-slate-500 font-medium mt-1">Identifique cadastros de clientes que possuam o mesmo número de telefone.</p>
            </div>
            <button onClick={handleScanDuplicates} disabled={isProcessing} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center gap-2 transition-all active:scale-95">
              {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />} Iniciar Varredura Dinâmica
            </button>

            {duplicateClients.length > 0 && (
              <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar mt-6 pt-6 border-t border-blue-100">
                {duplicateClients.map((dup, i) => (
                  <div key={i} className="p-6 bg-white border border-slate-200 rounded-[24px] space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded text-[10px] font-black">{dup.count} registros</span>
                      <h4 className="font-black text-slate-800 text-lg tracking-tight">{dup.phone}</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {dup.clients.map((c: any) => (
                        <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center hover:bg-slate-100 transition-colors cursor-default">
                          <div>
                            <p className="font-black text-[11px] uppercase text-slate-700">{c.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-1">ID: {c.id.slice(0, 8)}... | Status: <span className="text-blue-600">{c.status}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-8 bg-amber-50/50 rounded-3xl border border-amber-100 space-y-6 mt-6">
            <div>
              <h4 className="font-black text-slate-800 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /> Corrigir Clientes Inativos</h4>
              <p className="text-xs text-slate-500 font-medium mt-1">Suba o CSV de clientes inativos para atualizar a data da última compra e marcar como INATIVO no cadastro existente.</p>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="relative">
                <input
                  type="file"
                  accept=".csv"
                  id="inactiveCsvInput"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsProcessing(true);
                    try {
                      const text = await file.text();
                      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                      const dataLines = lines.slice(1);

                      const parseLine = (line: string): string[] => {
                        const result: string[] = [];
                        let current = '';
                        let inQuotes = false;
                        for (let i = 0; i < line.length; i++) {
                          const ch = line[i];
                          if (ch === '"') { inQuotes = !inQuotes; }
                          else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
                          else { current += ch; }
                        }
                        result.push(current.trim());
                        return result;
                      };

                      const entries = dataLines.map(line => {
                        const v = parseLine(line);
                        const dateStr = v[0];
                        const parts = dateStr.split('/');
                        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
                        return { name: v[2] || '', phone: v[3] || '', lastPurchaseDate: isoDate };
                      }).filter(e => e.name && e.phone);

                      const result = await dataService.batchUpdateInactiveClients(entries);
                      alert(`✅ Atualizados: ${result.updated}\n🔍 Não encontrados: ${result.notFound.length}\n\n${result.notFound.length > 0 ? 'Não encontrados:\n' + result.notFound.join('\n') : ''}`);
                      await refreshData();
                    } catch (err: any) {
                      alert(`Erro: ${err.message}`);
                    } finally {
                      setIsProcessing(false);
                      e.target.value = '';
                    }
                  }}
                />
                <button className="px-6 py-3 bg-amber-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center gap-2 transition-all active:scale-95" disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Subir CSV de Inativos
                </button>
              </div>

              <button
                onClick={async () => {
                  if (!confirm('Deseja limpar registros com nomes inválidos (fragmentos de endereço) do banco?')) return;
                  setIsProcessing(true);
                  try {
                    const cleaned = await dataService.cleanupBadClientRecords();
                    alert(`🧹 ${cleaned} registros inválidos removidos.`);
                    await refreshData();
                  } catch (err: any) {
                    alert(`Erro: ${err.message}`);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className="px-6 py-3 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center gap-2 transition-all active:scale-95"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Limpar Cadastros Fantasma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions Floating Bar */}
      {
        selectedTaskIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-10 fade-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-10">
            <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
              <span className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-black text-xs">{selectedTaskIds.length}</span>
              <span className="font-bold text-sm">Selecionados</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsRepiqueModalOpen(true)}
                className="flex items-center gap-2 hover:text-blue-200 transition-colors font-bold text-sm uppercase tracking-wider"
              >
                <Clock size={18} /> Solicitar Repique
              </button>
              <button
                onClick={() => setSelectedTaskIds([])}
                className="flex items-center gap-2 hover:text-red-200 transition-colors font-bold text-sm uppercase tracking-wider ml-4"
              >
                <X size={18} /> Cancelar
              </button>
            </div>
          </div>
        )
      }



      {/* Repique Modal */}
      <RepiqueModal
        isOpen={isRepiqueModalOpen}
        onClose={() => setIsRepiqueModalOpen(false)}
        selectedCount={selectedTaskIds.length}
        isProcessing={isProcessingRepique}
        onConfirm={async (data: RepiqueData) => {
          if (!user) return alert("Erro: Usuário não identificado.");
          setIsProcessingRepique(true);
          try {
            // Fetch validation data
            const allTasks = taskFilterChannel === 'VOICE' ? pendingTasks : pendingWhatsAppTasks;
            const selectedTasks = allTasks.filter((t: any) => selectedTaskIds.includes(t.id));

            const schedules = selectedTasks.map((t: any) => ({
              customerId: t.clientId,
              requestedByOperatorId: user.id,
              assignedOperatorId: t.assignedTo || user.id,
              scheduledFor: `${data.date}T${data.time}:00`,
              callType: t.type,
              status: 'PENDENTE_APROVACAO' as ScheduleStatus, // Force approval
              scheduleReason: data.reason,
              resolutionChannel: data.contactType === 'whatsapp' ? 'whatsapp' : 'telefone',
              hasRepick: true
            }));

            await dataService.bulkCreateScheduleRequest(schedules);

            // Clean up: Remove from current queue since they are now scheduled/pending approval
            if (taskFilterChannel === 'VOICE') {
              // If it's a task, maybe we should mark it as skipped or hold? 
              // Creating a schedule doesn't automatically delete the task unless we say so.
              // Usually repique implies "I will call later", so effectively rescheduling.
              // But the schedule is now in "Pendentes" (Approval Queue).
              // We should probably remove them from "Queue" to avoid double calling?
              // Or leave them until approved?
              // User said "appeared there instead of...". 
              // Let's assume we leave them in queue until approved? 
              // Dashboard implementation CLEARED the selection but didn't delete tasks.
              // Let's match Dashboard: just clear selection.
            }

            setSelectedTaskIds([]);
            setIsRepiqueModalOpen(false);
            await refreshData();
            alert('Repique solicitado com sucesso! Aguardando aprovação.');
          } catch (error) {
            console.error(error);
            alert('Erro ao processar repique.');
          } finally {
            setIsProcessingRepique(false);
          }
        }}
      />

      {/* Edit Type Modal */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Alterar Tipo</h3>
              <button onClick={() => setIsTypeModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleUpdateType} className="p-8 space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">1. Novo Contexto</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(CallType)
                    .filter(type => type !== CallType.WHATSAPP)
                    .map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedCallType(type)}
                        className={`p-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedCallType === type ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                      >
                        {type}
                      </button>
                    ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">2. Reatribuir Operador (Opcional)</label>
                <select
                  value={selectedOperatorId}
                  onChange={e => setSelectedOperatorId(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[11px] uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                >
                  <option value="">Manter atual...</option>
                  {users.filter(u => u.role === UserRole.OPERATOR || u.role === UserRole.SUPERVISOR).map(u => (
                    <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                  ))}
                </select>
              </div>

              <button type="submit" disabled={isProcessing} className="w-full py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={16} />} Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
