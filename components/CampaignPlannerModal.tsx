import React, { useState } from 'react';
import { CampaignPlannerService } from '../services/campaignPlannerService';
import { Campanha } from '../types';
import { X, Calendar, Settings, FileText } from 'lucide-react';
import { HelpTooltip } from './HelpTooltip';
import { HELP_TEXTS } from '../utils/helpTexts';

interface CampaignPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  operatorId?: string;
}

export const CampaignPlannerModal: React.FC<CampaignPlannerModalProps> = ({ isOpen, onClose, onSuccess, operatorId }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Campanha>>({
    nome: '',
    descricao: '',
    publico_alvo: 'CLIENT',
    tipo_mensagem: 'ambos',
    prioridade: 2,
    ativa: true
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        criado_pelo_planner: true,
        criado_em: new Date().toISOString()
      };
      await CampaignPlannerService.createCampaign(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Erro ao criar campanha: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X size={24} />
        </button>
        
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Calendar className="text-blue-600" />
            Criador de Campanhas
            <HelpTooltip content={HELP_TEXTS.CAMPANHA_PLANNER} />
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nome da Campanha</label>
              <input
                required
                type="text"
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                value={formData.nome}
                onChange={e => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Reforço de Vendas Verão"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Público Alvo</label>
              <select
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                value={formData.publico_alvo}
                onChange={e => setFormData({ ...formData, publico_alvo: e.target.value })}
              >
                <option value="CLIENT">Clientes (Base Ativa)</option>
                <option value="LEAD">Leads (Novos Contatos)</option>
                <option value="INATIVO">Inativos (Recuperação)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FileText size={16} /> Descrição / Objetivo
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-2 h-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={formData.descricao || ''}
              onChange={e => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descreva o objetivo desta campanha..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Settings size={16} /> Prioridade
              </label>
              <select
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                value={formData.prioridade}
                onChange={e => setFormData({ ...formData, prioridade: Number(e.target.value) })}
              >
                <option value={1}>1 - Alta (Fura Fila)</option>
                <option value={2}>2 - Média (Normal)</option>
                <option value={3}>3 - Baixa (Fundo de Funil)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Canal de Contato</label>
              <select
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                value={formData.tipo_mensagem}
                onChange={e => setFormData({ ...formData, tipo_mensagem: e.target.value })}
              >
                <option value="ambos">Voz + WhatsApp</option>
                <option value="voz">Apenas Voz (Ligação)</option>
                <option value="whatsapp">Apenas WhatsApp</option>
                <option value="email">Apenas E-mail</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
             <input 
                type="checkbox" 
                id="ativaMsg" 
                checked={formData.ativa} 
                onChange={e => setFormData({ ...formData, ativa: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
             />
             <label htmlFor="ativaMsg" className="text-sm text-blue-900 font-medium cursor-pointer">
                Ativar campanha imediatamente após criar
             </label>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !formData.nome}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
            >
              {loading ? 'Salvando...' : 'Criar Campanha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
