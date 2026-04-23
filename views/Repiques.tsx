import React from 'react';
import { CalendarClock, CheckCircle2, Filter, Loader2, MessageCircle, PhoneCall, Plus, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { ManualScheduleModal } from '../components/ManualScheduleModal';
import { RepiqueData, RepiqueModal } from '../components/RepiqueModal';
import { dataService } from '../services/dataService';
import { CallScheduleWithClient, ScheduleStatus, User as AppUser, UserRole } from '../types';
import { buildScheduledForValue } from '../utils/scheduleDateTime';

type RepiquesProps = {
  user: AppUser;
};

const STATUS_META: Record<ScheduleStatus, { label: string; classes: string }> = {
  PENDENTE_APROVACAO: { label: 'Pendente', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  APROVADO: { label: 'Aprovado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJEITADO: { label: 'Rejeitado', classes: 'bg-red-50 text-red-700 border-red-200' },
  REPROGRAMADO: { label: 'Reprogramado', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  CONCLUIDO: { label: 'Concluido', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  CANCELADO: { label: 'Excluido', classes: 'bg-rose-50 text-rose-700 border-rose-200' }
};

const isRepique = (schedule: CallScheduleWithClient) => (
  Boolean(schedule.hasRepick || schedule.skipReason || /repique/i.test(schedule.scheduleReason || ''))
);

const canManageRepique = (user: AppUser, schedule: CallScheduleWithClient) => (
  user.role === UserRole.ADMIN
  || user.role === UserRole.SUPERVISOR
  || schedule.assignedOperatorId === user.id
  || schedule.requestedByOperatorId === user.id
);

const Repiques: React.FC<RepiquesProps> = ({ user }) => {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | ScheduleStatus>('ALL');
  const [schedules, setSchedules] = React.useState<CallScheduleWithClient[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [editingSchedule, setEditingSchedule] = React.useState<CallScheduleWithClient | null>(null);

  const isManager = user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR;

  const loadRepiques = React.useCallback(async () => {
    setLoading(true);
    try {
      const allSchedules = await dataService.getSchedules();
      const repiques = allSchedules.filter(isRepique).sort((left, right) =>
        new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime()
      );
      setSchedules(repiques);
    } catch (error) {
      console.error('Erro ao carregar repiques.', error);
      alert('Nao foi possivel carregar os repiques.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRepiques();
  }, [loadRepiques]);

  const filteredSchedules = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return schedules.filter(schedule => {
      if (statusFilter !== 'ALL' && schedule.status !== statusFilter) return false;
      if (!normalizedSearch) return true;

      return [
        schedule.clientName,
        schedule.clientPhone,
        schedule.scheduleReason,
        schedule.skipReason,
        schedule.assignedOperatorName,
        schedule.requestedByName
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [schedules, search, statusFilter]);

  const counts = React.useMemo(() => ({
    total: schedules.length,
    pending: schedules.filter(schedule => schedule.status === 'PENDENTE_APROVACAO').length,
    approved: schedules.filter(schedule => schedule.status === 'APROVADO').length,
    canceled: schedules.filter(schedule => schedule.status === 'CANCELADO').length
  }), [schedules]);

  const handleApprove = async (schedule: CallScheduleWithClient) => {
    const approvalReason = window.prompt('Observacao da aprovacao (opcional):', schedule.approvalReason || '') || '';
    setSaving(true);
    try {
      await dataService.updateSchedule(schedule.id, {
        status: 'APROVADO',
        approvedByAdminId: user.id,
        approvalReason: approvalReason.trim() || undefined
      }, user.id);
      await loadRepiques();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel aprovar o repique.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (schedule: CallScheduleWithClient) => {
    const reason = window.prompt('Motivo da exclusao:', schedule.deleteReason || '');
    if (reason === null) return;

    setSaving(true);
    try {
      await dataService.updateSchedule(schedule.id, {
        status: 'CANCELADO',
        deletedBy: user.id,
        deletedAt: new Date().toISOString(),
        deleteReason: reason.trim() || 'Repique excluido manualmente'
      }, user.id);
      await loadRepiques();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel excluir o repique.');
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async (data: RepiqueData) => {
    if (!editingSchedule) return;

    setSaving(true);
    try {
      await dataService.updateSchedule(editingSchedule.id, {
        scheduledFor: buildScheduledForValue(data.date, data.time),
        scheduleReason: data.reason,
        resolutionChannel: data.contactType === 'whatsapp' ? 'whatsapp' : 'telefone',
        whatsappSent: data.contactType === 'whatsapp',
        rescheduledBy: user.id,
        rescheduledAt: new Date().toISOString(),
        rescheduleReason: data.reason,
        status: editingSchedule.status === 'APROVADO' ? 'APROVADO' : 'REPROGRAMADO'
      }, user.id);
      setEditingSchedule(null);
      await loadRepiques();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel reagendar o repique.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <CalendarClock className="text-orange-600" />
            Repiques
          </h1>
          <p className="text-sm text-slate-500 font-medium">Controle separado dos retornos de ligacao, com dia, hora, motivo e destino da fila.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void loadRepiques()}
            disabled={loading || saving}
            className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCcw size={15} />
            Atualizar
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-3 rounded-xl bg-orange-600 text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-2 shadow-lg shadow-orange-600/20"
          >
            <Plus size={15} />
            Novo Repique
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{counts.total}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Pendentes</p>
          <p className="mt-2 text-3xl font-black text-amber-800">{counts.pending}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Aprovados</p>
          <p className="mt-2 text-3xl font-black text-emerald-800">{counts.approved}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Excluidos</p>
          <p className="mt-2 text-3xl font-black text-rose-800">{counts.canceled}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3">
          <label className="relative block">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por cliente, telefone, motivo ou operador"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
            />
          </label>

          <label className="relative block">
            <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as 'ALL' | ScheduleStatus)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
            >
              <option value="ALL">Todos os status</option>
              <option value="PENDENTE_APROVACAO">Pendentes</option>
              <option value="APROVADO">Aprovados</option>
              <option value="REPROGRAMADO">Reprogramados</option>
              <option value="CANCELADO">Excluidos</option>
              <option value="CONCLUIDO">Concluidos</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500 font-bold gap-3">
            <Loader2 className="animate-spin" size={18} />
            Carregando repiques...
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-bold">
            Nenhum repique encontrado para o filtro atual.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSchedules.map(schedule => {
              const statusMeta = STATUS_META[schedule.status];
              const allowManage = canManageRepique(user, schedule);
              const showApprove = isManager && schedule.status === 'PENDENTE_APROVACAO';
              const channelLabel = schedule.resolutionChannel === 'whatsapp' || schedule.whatsappSent ? 'WhatsApp' : 'Ligacao';

              return (
                <article key={schedule.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black text-slate-900">{schedule.clientName || 'Cliente sem nome'}</h2>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusMeta.classes}`}>
                          {statusMeta.label}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                          {channelLabel === 'WhatsApp' ? <MessageCircle size={12} /> : <PhoneCall size={12} />}
                          {channelLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dia e hora</p>
                          <p className="mt-1 font-bold text-slate-700">{new Date(schedule.scheduledFor).toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operador</p>
                          <p className="mt-1 font-bold text-slate-700">{schedule.assignedOperatorName || 'Nao informado'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Solicitado por</p>
                          <p className="mt-1 font-bold text-slate-700">{schedule.requestedByName || 'Nao informado'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Telefone</p>
                          <p className="mt-1 font-bold text-slate-700">{schedule.clientPhone || '-'}</p>
                        </div>
                      </div>
                    </div>

                    {allowManage ? (
                      <div className="flex flex-wrap gap-2">
                        {showApprove ? (
                          <button
                            onClick={() => void handleApprove(schedule)}
                            disabled={saving}
                            className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-2 disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            Aprovar
                          </button>
                        ) : null}

                        <button
                          onClick={() => setEditingSchedule(schedule)}
                          disabled={saving}
                          className="px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-black uppercase text-[10px] tracking-widest"
                        >
                          Reagendar
                        </button>

                        <button
                          onClick={() => void handleDelete(schedule)}
                          disabled={saving || schedule.status === 'CANCELADO' || schedule.status === 'CONCLUIDO'}
                          className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          Excluir
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo do agendamento</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700 whitespace-pre-wrap">{schedule.scheduleReason || '-'}</p>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo do repique / pulo</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700 whitespace-pre-wrap">{schedule.skipReason || schedule.rescheduleReason || '-'}</p>
                      </div>
                      {schedule.deleteReason ? (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo da exclusao</p>
                          <p className="mt-1 text-sm font-semibold text-rose-700 whitespace-pre-wrap">{schedule.deleteReason}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isCreateModalOpen ? (
        <ManualScheduleModal
          user={user}
          mode="repique"
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            void loadRepiques();
          }}
        />
      ) : null}

      <RepiqueModal
        isOpen={Boolean(editingSchedule)}
        onClose={() => setEditingSchedule(null)}
        isProcessing={saving}
        onConfirm={handleReschedule}
        initialData={editingSchedule ? {
          date: editingSchedule.scheduledFor.slice(0, 10),
          time: new Date(editingSchedule.scheduledFor).toISOString().slice(11, 16),
          reason: editingSchedule.scheduleReason || editingSchedule.skipReason || '',
          contactType: editingSchedule.resolutionChannel === 'whatsapp' || editingSchedule.whatsappSent ? 'whatsapp' : 'call',
          shouldRemoveFromQueue: false
        } : undefined}
      />
    </div>
  );
};

export default Repiques;
