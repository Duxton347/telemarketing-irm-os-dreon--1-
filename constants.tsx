
import { CallType } from './types';

export const COLORS = {
  primary: '#0088cc',
  secondary: '#fff100',
  dark: '#222222',
  accent: '#1e40af',
  stages: {
    atendimento: '#2563eb',
    tecnico: '#7c3aed',
    logistica: '#f59e0b',
    produto: '#10b981',
    suporte: '#0ea5e9',
    marca: '#f43f5e'
  }
};

// Motivos de Pulo (Skip Reasons) Padronizados
export const SKIP_REASONS = [
  'NÃO ATENDE',
  'CAIXA POSTAL',
  'NÚMERO ERRADO / INEXISTENTE',
  'CLIENTE OCUPADO / RETORNAR DEPOIS',
  'FORA DE ÁREA',
  'RECUSOU ATENDIMENTO'
];

// Pesos para o cálculo do IDE (Total 1.0)
export const STAGE_CONFIG = {
  atendimento: { label: 'Compra/Atendimento', weight: 0.20, color: COLORS.stages.atendimento },
  tecnico: { label: 'Dimensionamento', weight: 0.15, color: COLORS.stages.tecnico },
  logistica: { label: 'Entrega/Execução', weight: 0.20, color: COLORS.stages.logistica },
  produto: { label: 'Expectativas/Resultado', weight: 0.25, color: COLORS.stages.produto },
  suporte: { label: 'Uso/Manutenção', weight: 0.10, color: COLORS.stages.suporte },
  marca: { label: 'Recomendação', weight: 0.10, color: COLORS.stages.marca }
};

export const PROTOCOL_SLA: Record<string, number> = {
  'Alta': 24, // horas
  'Média': 48,
  'Baixa': 72
};

export const SATISFACTION_EMOJIS: Record<string, string> = {
  low: '😞',
  medium: '😐',
  high: '😊'
};

// Mapeamento de Pontuação 0-2 para cálculo de IDE
export const SCORE_MAP: Record<string, number> = {
  'Ótimo': 2, 'Ok': 1, 'Precisa melhorar': 0,
  'Sim': 2, 'Parcial': 1, 'Não': 0,
  'No prazo': 2, 'Pequeno atraso': 1, 'Com problema': 0,
  'Atendeu': 2, 'Não atendeu': 0,
  'Leve': 1, 'Sim, teve dificuldades': 0,
  'Talvez': 1
};

export const DEFAULT_QUESTIONS = [
  // POS-VENDA (Mapeado para Estágios)
  { id: 'pv1', text: 'Atendimento durante a compra', options: ['Ótimo', 'Ok', 'Precisa melhorar'], type: CallType.POS_VENDA, order: 1, stageId: 'atendimento' },
  { id: 'pv2', text: 'Segurança no dimensionamento/indicação', options: ['Sim', 'Parcial', 'Não'], type: CallType.POS_VENDA, order: 2, stageId: 'tecnico' },
  { id: 'pv3', text: 'Entrega/execução conforme combinado', options: ['No prazo', 'Pequeno atraso', 'Com problema'], type: CallType.POS_VENDA, order: 3, stageId: 'logistica' },
  { id: 'pv4', text: 'Equipamento atendeu expectativas', options: ['Atendeu', 'Parcial', 'Não atendeu'], type: CallType.POS_VENDA, order: 4, stageId: 'produto' },
  { id: 'pv5', text: 'Dificuldade de uso/manutenção', options: ['Não', 'Leve', 'Sim, teve dificuldades'], type: CallType.POS_VENDA, order: 5, stageId: 'suporte' },
  { id: 'pv6', text: 'Recomendaria a empresa', options: ['Sim', 'Talvez', 'Não'], type: CallType.POS_VENDA, order: 6, stageId: 'marca' },
  { id: 'pv7', text: 'Principal ponto de insatisfação do cliente', options: ['NEGOCIAÇÃO', 'GARANTIA', 'ATRASO NA EXECUÇÃO', 'ATRASO NA ENTREGA', 'DEFEITO NO EQUIPAMENTO', 'DEFEITO NA INSTALAÇÃO', 'VENDA INCOMPLETE', 'ATENDIMENTO'], type: CallType.POS_VENDA, order: 7 },
  { id: 'pv8', text: 'O cliente pode ser explorado para comprar algo?', options: ['NÃO, CLIENTE PERDIDO', 'QUIMICOS', 'FOTOVOLTAICO', 'LINHA BANHO', 'LINHA PISCINA', 'AQUECEDORES', 'OUTROS'], type: CallType.POS_VENDA, order: 8 },

  // PROSPECCAO
  { id: 'pr1', text: 'Receptividade na abordagem', options: ['Boa', 'Neutra', 'Ruim'], type: CallType.PROSPECCAO, order: 1 },
  { id: 'pr2', text: 'Interesse no produto/serviço', options: ['Alto', 'Médio', 'Baixo'], type: CallType.PROSPECCAO, order: 2 },
  { id: 'pr3', text: 'Momento de compra', options: ['Agora', 'Em breve', 'Sem previsão'], type: CallType.PROSPECCAO, order: 3 },

  // REATIVACAO (Mesmo questionário de prospecção, sem CRM)
  { id: 're1', text: 'Receptividade na abordagem', options: ['Boa', 'Neutra', 'Ruim'], type: CallType.REATIVACAO, order: 1 },
  { id: 're2', text: 'Interesse no produto/serviço', options: ['Alto', 'Médio', 'Baixo'], type: CallType.REATIVACAO, order: 2 },
  { id: 're3', text: 'Momento de compra', options: ['Agora', 'Em breve', 'Sem previsão'], type: CallType.REATIVACAO, order: 3 },

  // VENDA
  { id: 'v1', text: 'Interesse inicial', options: ['Alto', 'Médio', 'Baixo'], type: CallType.VENDA, order: 1 },
  { id: 'v2', text: 'Objeção principal', options: ['Preço', 'Prazo', 'Confiança', 'Não precisa', 'Outro'], type: CallType.VENDA, order: 2 },

  // CONFIRMACAO PROTOCOLO
  { id: 'cp1', text: 'O problema foi resolvido?', options: ['Sim', 'Parcial', 'Não'], type: CallType.CONFIRMACAO_PROTOCOLO, order: 1 },
  { id: 'cp2', text: 'Solução/Atendimento do problema', options: ['Ótimo', 'Ok', 'Precisa melhorar'], type: CallType.CONFIRMACAO_PROTOCOLO, order: 2 },
  { id: 'cp3', text: 'O prazo para resolver foi adequado?', options: ['No prazo', 'Pequeno atraso', 'Com problema'], type: CallType.CONFIRMACAO_PROTOCOLO, order: 3 },
  { id: 'cp4', text: 'Comunicação/Clareza sobre a solução', options: ['Atendeu', 'Parcial', 'Não atendeu'], type: CallType.CONFIRMACAO_PROTOCOLO, order: 4 },
  { id: 'cp5', text: 'Recomendaria a empresa após a solução?', options: ['Sim', 'Talvez', 'Não'], type: CallType.CONFIRMACAO_PROTOCOLO, order: 5 }
];
