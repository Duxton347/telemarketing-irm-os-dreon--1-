import React, { useState } from 'react';
import { ClientTag } from '../types';
import { dataService } from '../services/dataService';
import { Check, X, Tag as TagIcon, AlertCircle } from 'lucide-react';

interface TagApprovalCardProps {
  tag: ClientTag;
  onRefresh: () => void;
  operatorId: string;
  isSupervisor?: boolean;
}

export const TagApprovalCard: React.FC<TagApprovalCardProps> = ({ tag, onRefresh, operatorId, isSupervisor }) => {
  const [loading, setLoading] = useState(false);

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
    if (!window.confirm(`Tem certeza que deseja ${action === 'reject' ? 'rejeitar' : 'aprovar'} esta Tag?`)) {
        return;
    }
    setLoading(true);
    try {
      if (action === 'confirm') await dataService.confirmTag(tag.id, operatorId);
      if (action === 'approve') await dataService.approveTag(tag.id, operatorId);
      if (action === 'reject') await dataService.rejectTag(tag.id, operatorId, 'Rejeitado visualmente');
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro ao atualizar tag');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`border rounded-lg p-4 shadow-sm flex flex-col gap-3 ${getStatusColor(tag.status)} bg-opacity-30`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <TagIcon size={18} className="text-current opacity-70" />
          <h4 className="font-bold text-sm">{tag.label}</h4>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getStatusColor(tag.status)}`}>
          {tag.status.replace('_', ' ')}
        </span>
      </div>

      <div className="text-xs space-y-1 opacity-90">
        <p><strong>Categoria:</strong> {tag.categoria}</p>
        <p><strong>Confiança:</strong> {tag.score_confianca ? `${tag.score_confianca} pts` : '-'}</p>
        <p><strong>Data:</strong> {new Date(tag.criado_em).toLocaleString()}</p>
        {tag.campos_negativos && tag.campos_negativos.length > 0 && (
          <p className="text-red-700 font-medium flex items-center gap-1 mt-1">
            <AlertCircle size={12} />
            Alertas: {tag.campos_negativos.join(', ')}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        {tag.status === 'SUGERIDA' && !isSupervisor && (
          <>
            <button onClick={() => handleAction('reject')} disabled={loading} className="px-3 py-1.5 text-xs bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded shadow-sm flex items-center gap-1 transition-colors">
              <X size={14} /> Rejeitar
            </button>
            <button onClick={() => handleAction('confirm')} disabled={loading} className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm flex items-center gap-1 transition-colors">
              <Check size={14} /> Confirmar
            </button>
          </>
        )}

        {(tag.status === 'CONFIRMADA_OPERADOR' || tag.status === 'SUGERIDA') && isSupervisor && (
             <>
             <button onClick={() => handleAction('reject')} disabled={loading} className="px-3 py-1.5 text-xs bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded shadow-sm flex items-center gap-1 transition-colors">
               <X size={14} /> Rejeitar
             </button>
             <button onClick={() => handleAction('approve')} disabled={loading} className="px-3 py-1.5 text-xs bg-green-600 text-white hover:bg-green-700 rounded shadow-sm flex items-center gap-1 transition-colors">
               <Check size={14} /> Aprovar Definitivo
             </button>
           </>
        )}
      </div>
    </div>
  );
};
