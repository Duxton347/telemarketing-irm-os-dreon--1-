import React, { useEffect, useState } from 'react';
import { Check, X, Tag as TagIcon, AlertCircle } from 'lucide-react';
import { ClientTag } from '../types';
import { dataService } from '../services/dataService';

interface TagApprovalCardProps {
  tag: ClientTag;
  onRefresh?: () => void;
  onUpdated?: (tag: ClientTag) => void;
  operatorId: string;
  isSupervisor?: boolean;
}

export const TagApprovalCard: React.FC<TagApprovalCardProps> = ({ tag, onRefresh, onUpdated, operatorId, isSupervisor }) => {
  const [loading, setLoading] = useState(false);
  const [currentTag, setCurrentTag] = useState<ClientTag>(tag);

  useEffect(() => {
    setCurrentTag(tag);
  }, [tag]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUGERIDA': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'CONFIRMADA_OPERADOR': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'APROVADA_SUPERVISOR': return 'bg-green-100 text-green-800 border-green-200';
      case 'REJEITADA': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleAction = async (action: 'confirm' | 'approve' | 'reject') => {
    const actionLabel = action === 'reject' ? 'rejeitar' : (isSupervisor ? 'aprovar' : 'validar');
    if (!window.confirm(`Tem certeza que deseja ${actionLabel} esta tag?`)) {
      return;
    }

    const rejectionReason = action === 'reject'
      ? window.prompt('Motivo da rejeicao:', currentTag.motivo_rejeicao || '')
      : null;

    if (action === 'reject' && rejectionReason === null) {
      return;
    }

    setLoading(true);
    try {
      let updatedTag = currentTag;
      if (action === 'confirm') updatedTag = await dataService.confirmTag(currentTag.id, operatorId);
      if (action === 'approve') updatedTag = await dataService.approveTag(currentTag.id, operatorId);
      if (action === 'reject') updatedTag = await dataService.rejectTag(currentTag.id, operatorId, rejectionReason || 'Rejeitada manualmente');

      setCurrentTag(updatedTag);
      onUpdated?.(updatedTag);
      onRefresh?.();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Erro ao atualizar tag');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`border rounded-lg p-4 shadow-sm flex flex-col gap-3 ${getStatusColor(currentTag.status)} bg-opacity-30`}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <TagIcon size={18} className="text-current opacity-70 shrink-0" />
          <h4 className="font-bold text-sm">{currentTag.label}</h4>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getStatusColor(currentTag.status)}`}>
          {currentTag.status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="text-xs space-y-1 opacity-90">
        <p><strong>Categoria:</strong> {currentTag.categoria}</p>
        {currentTag.motivo_detalhe && <p><strong>Detalhe:</strong> {currentTag.motivo_detalhe}</p>}
        <p><strong>Confianca:</strong> {currentTag.score_confianca ? `${currentTag.score_confianca} pts` : '-'}</p>
        <p><strong>Data:</strong> {new Date(currentTag.criado_em).toLocaleString()}</p>
        {currentTag.motivo_rejeicao && <p><strong>Motivo da rejeicao:</strong> {currentTag.motivo_rejeicao}</p>}
        {currentTag.campos_negativos && currentTag.campos_negativos.length > 0 && (
          <p className="text-red-700 font-medium flex items-center gap-1 mt-1">
            <AlertCircle size={12} />
            Alertas: {currentTag.campos_negativos.join(', ')}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-2 flex-wrap">
        {currentTag.status === 'SUGERIDA' && !isSupervisor && (
          <>
            <button onClick={() => handleAction('reject')} disabled={loading} className="px-3 py-1.5 text-xs bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded shadow-sm flex items-center gap-1 transition-colors">
              <X size={14} /> Rejeitar
            </button>
            <button onClick={() => handleAction('confirm')} disabled={loading} className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm flex items-center gap-1 transition-colors">
              <Check size={14} /> Validar
            </button>
          </>
        )}

        {(currentTag.status === 'CONFIRMADA_OPERADOR' || currentTag.status === 'SUGERIDA') && isSupervisor && (
          <>
            <button onClick={() => handleAction('reject')} disabled={loading} className="px-3 py-1.5 text-xs bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded shadow-sm flex items-center gap-1 transition-colors">
              <X size={14} /> Rejeitar
            </button>
            <button onClick={() => handleAction('approve')} disabled={loading} className="px-3 py-1.5 text-xs bg-green-600 text-white hover:bg-green-700 rounded shadow-sm flex items-center gap-1 transition-colors">
              <Check size={14} /> Aprovar
            </button>
          </>
        )}
      </div>
    </div>
  );
};
