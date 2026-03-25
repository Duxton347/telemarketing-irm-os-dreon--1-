import { Client, Question } from '../types';

export type QuestionnaireLogicalClass =
  | 'CADASTRAL'
  | 'QUALIFICACAO_COMERCIAL'
  | 'ACOMPANHAMENTO'
  | 'AVALIACAO'
  | 'DIAGNOSTICO'
  | 'RECUPERACAO_RETENCAO'
  | 'TECNICA_OPERACIONAL'
  | 'OPORTUNIDADE_COMERCIAL'
  | 'INDICACAO';

export type QuestionnaireBusinessFeed =
  | 'CADASTRO'
  | 'HISTORICO'
  | 'SATISFACAO'
  | 'RETENCAO'
  | 'TECNICO'
  | 'OPORTUNIDADE_COMERCIAL';

export type QuestionnaireIndexKey =
  | 'indice_satisfacao'
  | 'indice_retencao'
  | 'indice_interesse_comercial'
  | 'indice_qualidade_cadastro'
  | 'indice_risco_perda'
  | 'indice_oportunidade_upsell'
  | 'indice_gravidade_operacional'
  | 'indice_recuperabilidade';

export interface QuestionnaireBusinessClientContext {
  clientId?: string;
  email?: string | null;
  buyerName?: string | null;
  responsiblePhone?: string | null;
  status?: string | null;
  tags?: string[] | null;
}

export interface QuestionnaireQuestionDisplayContext {
  clientContext?: QuestionnaireBusinessClientContext | null;
  responses?: Record<string, any>;
}

export interface QuestionnaireBusinessQuestionSignal {
  questionId: string;
  questionText: string;
  logicalType: QuestionnaireLogicalClass;
  objective: string;
  strategicValue: string;
  eligibleCallTypes: string[];
  feeds: QuestionnaireBusinessFeed[];
  answer: unknown;
  interpretedValue?: string;
  tags: string[];
  indices: Partial<Record<QuestionnaireIndexKey, { score: number; weight: number }>>;
  keywords: string[];
  capturedData: Record<string, any>;
}

export interface QuestionnaireBusinessProfile {
  clientePerfil:
    | 'CLIENTE_AVALIA_BEM'
    | 'CLIENTE_AVALIA_MAL'
    | 'CLIENTE_NEUTRO'
    | 'SEM_LEITURA';
  retencaoPerfil:
    | 'CLIENTE_RECUPERAVEL'
    | 'CLIENTE_EM_RISCO_DE_PERDA'
    | 'RETENCAO_NEUTRA';
  comercialPerfil:
    | 'CLIENTE_EXPLORAVEL_COMERCIALMENTE'
    | 'LEAD_MORNO'
    | 'LEAD_FRIO'
    | 'SEM_SINAL_COMERCIAL';
  cadastroPerfil: 'CADASTRO_RICO' | 'CADASTRO_POBRE';
  leadTemperatura: 'LEAD_QUENTE' | 'LEAD_MORNO' | 'LEAD_FRIO' | 'NAO_APLICAVEL';
}

export interface QuestionnaireBusinessContext {
  tags: string[];
  indices: Record<QuestionnaireIndexKey, number>;
  profile: QuestionnaireBusinessProfile;
  questionSignals: QuestionnaireBusinessQuestionSignal[];
  feeds: QuestionnaireBusinessFeed[];
  capturedData: {
    email?: string;
    buyerName?: string;
    responsiblePhone?: string;
    interestProduct?: string;
    indicationName?: string;
    indicationPhone?: string;
    indicationNeed?: string;
  };
}

type QuestionBusinessRuleMeta = {
  logicalType: QuestionnaireLogicalClass;
  objective: string;
  strategicValue: string;
  feeds: QuestionnaireBusinessFeed[];
  eligibleCallTypes?: string[];
  extraCallTypes?: string[];
  displayCondition?: 'ALWAYS' | 'MISSING_EMAIL' | 'MISSING_BUYER_NAME' | 'MISSING_RESPONSIBLE_PHONE';
  primaryDataField?: 'email' | 'buyer_name' | 'responsible_phone' | 'interest_product';
};

type InterestLine =
  | 'QUIMICOS'
  | 'FOTOVOLTAICO'
  | 'LINHA BANHO'
  | 'LINHA PISCINA'
  | 'AQUECEDORES'
  | 'OUTROS';

const INDEX_KEYS: QuestionnaireIndexKey[] = [
  'indice_satisfacao',
  'indice_retencao',
  'indice_interesse_comercial',
  'indice_qualidade_cadastro',
  'indice_risco_perda',
  'indice_oportunidade_upsell',
  'indice_gravidade_operacional',
  'indice_recuperabilidade'
];

const CALL_TYPE_POS_VENDA = 'POS_VENDA';
const CALL_TYPE_PROSPECCAO = 'PROSPECCAO';
const CALL_TYPE_VENDA = 'VENDA';
const CALL_TYPE_CONFIRMACAO_PROTOCOLO = 'CONFIRMACAO_PROTOCOLO';
const CALL_TYPE_REATIVACAO = 'REATIVACAO';
const CALL_TYPE_ASSISTENCIA = 'ASSISTENCIA';
const CALL_TYPE_ALL = 'ALL';

const MAIN_CALL_TYPES = [
  CALL_TYPE_PROSPECCAO,
  CALL_TYPE_VENDA,
  CALL_TYPE_POS_VENDA,
  CALL_TYPE_CONFIRMACAO_PROTOCOLO,
  CALL_TYPE_REATIVACAO,
  CALL_TYPE_ASSISTENCIA
];

const PROSPECT_CADASTRAL_COMPLEMENT_CALL_TYPES = [
  CALL_TYPE_VENDA,
  CALL_TYPE_REATIVACAO,
  CALL_TYPE_ASSISTENCIA,
  CALL_TYPE_POS_VENDA
];

const QUESTIONNAIRE_GENERIC_VALUES = new Set(['sim', 'outro', 'outros', 'yes']);

const NEGATIVE_RETENTION_TAGS = new Set([
  'RISCO_DE_PERDA',
  'RETENCAO_BAIXA',
  'RECLAMACAO_GRAVE'
]);

const neutralProfile: QuestionnaireBusinessProfile = {
  clientePerfil: 'SEM_LEITURA',
  retencaoPerfil: 'RETENCAO_NEUTRA',
  comercialPerfil: 'SEM_SINAL_COMERCIAL',
  cadastroPerfil: 'CADASTRO_POBRE',
  leadTemperatura: 'NAO_APLICAVEL'
};

export const normalizeQuestionnaireCallType = (value?: string | null) =>
  String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const hasMeaningfulValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const hasValidEmail = (value?: unknown) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());

const sanitizeText = (value?: unknown) => {
  if (!hasMeaningfulValue(value)) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const sanitizePhone = (value?: unknown) => {
  if (!hasMeaningfulValue(value)) return undefined;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 8 ? digits : undefined;
};

const sanitizeEmail = (value?: unknown) => {
  if (!hasValidEmail(value)) return undefined;
  return String(value).trim().toLowerCase();
};

const buildClientContextFromClient = (client?: Partial<Client> | null): QuestionnaireBusinessClientContext => ({
  clientId: client?.id,
  email: typeof client?.email === 'string' ? client.email : undefined,
  buyerName: typeof client?.buyer_name === 'string' ? client.buyer_name : undefined,
  responsiblePhone: typeof client?.responsible_phone === 'string' ? client.responsible_phone : undefined,
  status: typeof client?.status === 'string' ? client.status : undefined,
  tags: Array.isArray(client?.tags) ? client.tags : undefined
});

const resolveStoredQuestionValue = (question: Question, responses: Record<string, any> = {}) => {
  const candidateKeys = [question.campo_resposta, question.id, question.text].filter(Boolean) as string[];

  for (const key of candidateKeys) {
    const raw = responses[key];
    const note = responses[`${key}_note`];

    if (typeof raw === 'string') {
      const normalized = normalizeText(raw);
      if (QUESTIONNAIRE_GENERIC_VALUES.has(normalized) && hasMeaningfulValue(note)) {
        return String(note).trim();
      }

      if (raw.trim()) return raw.trim();
    }

    if (hasMeaningfulValue(raw)) return raw;
    if (hasMeaningfulValue(note)) return note;
  }

  return undefined;
};

const QUESTION_RULES: Record<string, QuestionBusinessRuleMeta> = {
  'e029be6a-7f8f-4508-ba9e-d59313415fd5': {
    logicalType: 'QUALIFICACAO_COMERCIAL',
    objective: 'Identificar se houve contato com decisor ou intermediario.',
    strategicValue: 'Mede a maturidade real da prospeccao.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  '8868c7a3-5a0f-4537-9fab-3f61be064e36': {
    logicalType: 'CADASTRAL',
    objective: 'Registrar o nome do contato principal.',
    strategicValue: 'Enriquece cadastro e melhora follow-up.',
    feeds: ['CADASTRO', 'HISTORICO'],
    extraCallTypes: PROSPECT_CADASTRAL_COMPLEMENT_CALL_TYPES,
    displayCondition: 'MISSING_BUYER_NAME',
    primaryDataField: 'buyer_name'
  },
  '7ed45177-702a-4575-b227-b56c6af80737': {
    logicalType: 'CADASTRAL',
    objective: 'Registrar WhatsApp direto do contato.',
    strategicValue: 'Habilita follow-up e abordagem comercial.',
    feeds: ['CADASTRO', 'HISTORICO'],
    extraCallTypes: PROSPECT_CADASTRAL_COMPLEMENT_CALL_TYPES,
    displayCondition: 'MISSING_RESPONSIBLE_PHONE',
    primaryDataField: 'responsible_phone'
  },
  '55f73fa2-f1ee-48e0-8d8c-9985ea2d58e3': {
    logicalType: 'CADASTRAL',
    objective: 'Registrar e-mail util para proposta e relacionamento.',
    strategicValue: 'Aumenta capacidade de campanha e formalizacao.',
    feeds: ['CADASTRO', 'HISTORICO'],
    extraCallTypes: PROSPECT_CADASTRAL_COMPLEMENT_CALL_TYPES,
    displayCondition: 'MISSING_EMAIL',
    primaryDataField: 'email'
  },
  '77e5075f-7299-4a6c-9f6f-8094396f1e24': {
    logicalType: 'QUALIFICACAO_COMERCIAL',
    objective: 'Entender a linha de interesse da necessidade principal.',
    strategicValue: 'Segmenta campanhas e abordagem comercial.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL'],
    primaryDataField: 'interest_product'
  },
  '9144c4d1-f22e-4e79-a51b-127c771d8101': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Mapear como o lead resolve o problema hoje.',
    strategicValue: 'Ajuda a entender contexto e objecao.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  'eddaa6ae-3bbb-4324-a171-f51cd2f37684': {
    logicalType: 'ACOMPANHAMENTO',
    objective: 'Medir janela temporal do investimento.',
    strategicValue: 'Priorizacao comercial por timing.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  'a7851594-7661-4f00-bbd4-1e6647a6bd48': {
    logicalType: 'INDICACAO',
    objective: 'Capturar novo lead via indicacao.',
    strategicValue: 'Abre oportunidade secundaria de venda.',
    feeds: ['CADASTRO', 'HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  '25e1e211-2533-4479-b383-c0359cfdd105': {
    logicalType: 'INDICACAO',
    objective: 'Registrar contato do indicado.',
    strategicValue: 'Torna a indicacao acionavel.',
    feeds: ['CADASTRO', 'HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  'a5634ff2-2d80-42ec-b7fb-50c00a4a8881': {
    logicalType: 'INDICACAO',
    objective: 'Entender necessidade do indicado.',
    strategicValue: 'Qualifica o potencial comercial da indicacao.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  '2ad8652b-71c2-4d5a-a8b6-3a94ae6cbe1a': {
    logicalType: 'QUALIFICACAO_COMERCIAL',
    objective: 'Medir receptividade inicial do prospect.',
    strategicValue: 'Qualifica nivel de tracao comercial.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  'd5cd79dd-bc41-4014-bd77-d0167825c060': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Identificar a objecao dominante da venda.',
    strategicValue: 'Alimenta inteligencia de perda e negociacao.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  'c56913ae-e933-42e6-bf58-733ed3da4d2b': {
    logicalType: 'OPORTUNIDADE_COMERCIAL',
    objective: 'Registrar o produto ou servico com interesse aderente.',
    strategicValue: 'Alimenta upsell, remarketing e segmentacao.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL'],
    primaryDataField: 'interest_product'
  },
  '41b1853b-b41b-4abd-9c96-27037be94d2a': {
    logicalType: 'QUALIFICACAO_COMERCIAL',
    objective: 'Medir viabilidade financeira declarada.',
    strategicValue: 'Indica prontidao de avancar comercialmente.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  '2d5a95aa-46d0-46ab-96ab-c816e0e024e4': {
    logicalType: 'ACOMPANHAMENTO',
    objective: 'Orientar follow-up pela janela de decisao.',
    strategicValue: 'Prioriza fila comercial por prazo.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL']
  },
  '47f86d94-ca65-47db-907c-42502023283d': {
    logicalType: 'AVALIACAO',
    objective: 'Medir percepcao do atendimento na compra.',
    strategicValue: 'Compoe satisfacao do relacionamento.',
    feeds: ['HISTORICO', 'SATISFACAO']
  },
  '8c1901f1-9dc7-478f-8c4b-4b526fb7cfa4': {
    logicalType: 'AVALIACAO',
    objective: 'Medir confianca tecnica no dimensionamento.',
    strategicValue: 'Mostra credibilidade tecnica da empresa.',
    feeds: ['HISTORICO', 'SATISFACAO', 'TECNICO']
  },
  'b58f3257-c0c9-43b8-9e63-b0304b6072db': {
    logicalType: 'AVALIACAO',
    objective: 'Medir cumprimento operacional da promessa.',
    strategicValue: 'Aponta saude da entrega e execucao.',
    feeds: ['HISTORICO', 'SATISFACAO', 'TECNICO']
  },
  'e2870432-334d-4e49-b7c0-3c369ea8ff54': {
    logicalType: 'AVALIACAO',
    objective: 'Medir aderencia entre expectativa e produto.',
    strategicValue: 'Indica aprovacao do resultado entregue.',
    feeds: ['HISTORICO', 'SATISFACAO']
  },
  '08011904-21ff-4206-9aa9-be9e8f95cda2': {
    logicalType: 'AVALIACAO',
    objective: 'Mapear atrito no uso e manutencao.',
    strategicValue: 'Aciona suporte e reduz friccao pos-venda.',
    feeds: ['HISTORICO', 'SATISFACAO', 'TECNICO']
  },
  '4fb97f9f-e19e-4748-b703-938ad5da1259': {
    logicalType: 'AVALIACAO',
    objective: 'Medir recomendacao e reputacao percebida.',
    strategicValue: 'Um dos principais sinais de satisfacao e risco.',
    feeds: ['HISTORICO', 'SATISFACAO', 'RETENCAO']
  },
  'fd580427-df50-40e4-b48a-3ea484a36137': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Identificar a causa central da insatisfacao.',
    strategicValue: 'Direciona melhoria e retencao.',
    feeds: ['HISTORICO', 'SATISFACAO', 'RETENCAO', 'TECNICO']
  },
  '13d8a0f3-1917-4fa6-a6cb-29e4b9b1e919': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Detalhar falha do atendimento.',
    strategicValue: 'Traduz reclamacao em categoria acionavel.',
    feeds: ['HISTORICO', 'SATISFACAO', 'RETENCAO']
  },
  '372a955e-71ae-4c53-9645-ca49129e7896': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Entender o que recomporia a relacao.',
    strategicValue: 'Define caminho de recuperacao.',
    feeds: ['HISTORICO', 'RETENCAO']
  },
  '4447ccd4-39a8-4447-947d-0d76a407e210': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Medir abertura para nova chance apos falha de atendimento.',
    strategicValue: 'Principal sinal de recuperabilidade do caso.',
    feeds: ['HISTORICO', 'RETENCAO']
  },
  '1ffb395d-f555-4f71-a1ac-a0edd31eb757': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Medir magnitude do atraso reportado.',
    strategicValue: 'Quantifica gravidade operacional.',
    feeds: ['HISTORICO', 'TECNICO']
  },
  'f3d56ad0-c632-474c-926e-e569461dad18': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Medir prejuizo declarado pelo atraso.',
    strategicValue: 'Eleva gravidade e risco de perda.',
    feeds: ['HISTORICO', 'RETENCAO', 'TECNICO']
  },
  '04d6f4b3-977d-41a8-8d56-4d19b15fde0a': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Medir continuidade apos falha de prazo.',
    strategicValue: 'Mostra risco de churn por atraso.',
    feeds: ['HISTORICO', 'RETENCAO']
  },
  '4a95642e-fbe7-488e-b922-b4de2a532f75': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Detalhar a falha concreta da execucao.',
    strategicValue: 'Apoia diagnostico operacional e retrabalho.',
    feeds: ['HISTORICO', 'RETENCAO', 'TECNICO']
  },
  'ceb2c51a-5edd-495d-b84c-c321428b668e': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Verificar se existe tecnico especifico associado a falha.',
    strategicValue: 'Separa falha individual de falha sistemica.',
    feeds: ['HISTORICO', 'TECNICO']
  },
  '206e7727-47cb-48a7-b8f6-af9a12deac09': {
    logicalType: 'TECNICA_OPERACIONAL',
    objective: 'Medir necessidade de retrabalho.',
    strategicValue: 'Eleva gravidade operacional e risco.',
    feeds: ['HISTORICO', 'RETENCAO', 'TECNICO']
  },
  '731f6de2-6970-4535-8a69-ef9bf68317e3': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Medir abertura apos falha de execucao.',
    strategicValue: 'Determina recuperabilidade do caso.',
    feeds: ['HISTORICO', 'RETENCAO']
  },
  'ef206cd0-ca22-4f2b-bfa2-60f25564b368': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Identificar defeito ou inadequacao do produto.',
    strategicValue: 'Traduz falha em causa operacional.',
    feeds: ['HISTORICO', 'RETENCAO', 'TECNICO']
  },
  '62af76ea-37e7-4332-93d6-6909e9a1afda': {
    logicalType: 'TECNICA_OPERACIONAL',
    objective: 'Mapear a tratativa esperada pelo cliente.',
    strategicValue: 'Diferencia correcao, troca e risco de reembolso.',
    feeds: ['HISTORICO', 'RETENCAO', 'TECNICO']
  },
  '1d3817b1-4b23-4617-8c42-d58f404f9322': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Medir continuidade apos problema com produto.',
    strategicValue: 'Mostra risco de churn pos-defeito.',
    feeds: ['HISTORICO', 'RETENCAO']
  },
  '5985512d-90e9-403a-8335-d3392262d1eb': {
    logicalType: 'AVALIACAO',
    objective: 'Medir percepcao do fechamento do protocolo.',
    strategicValue: 'Indica satisfacao com o desfecho.',
    feeds: ['HISTORICO', 'SATISFACAO', 'RETENCAO']
  },
  '8981f637-eeae-4a03-a671-7c9ff015c811': {
    logicalType: 'AVALIACAO',
    objective: 'Validar se o problema foi resolvido de fato.',
    strategicValue: 'Separa encerramento formal de resolucao real.',
    feeds: ['HISTORICO', 'SATISFACAO', 'RETENCAO']
  },
  '6a5b7cf5-ab10-4a38-9378-a96de24dc778': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Registrar pendencia remanescente do protocolo.',
    strategicValue: 'Mantem o historico de caso ainda aberto.',
    feeds: ['HISTORICO', 'RETENCAO', 'TECNICO']
  },
  '044723ef-3139-479d-80d3-a76e91b09b9d': {
    logicalType: 'AVALIACAO',
    objective: 'Avaliar a qualidade da solucao apresentada.',
    strategicValue: 'Mede aceitacao da tratativa.',
    feeds: ['HISTORICO', 'SATISFACAO']
  },
  '5a1a0efa-103d-4948-9914-6432d91cca05': {
    logicalType: 'AVALIACAO',
    objective: 'Medir adequacao do prazo da resolucao.',
    strategicValue: 'Mostra saude do tempo de atendimento.',
    feeds: ['HISTORICO', 'SATISFACAO', 'TECNICO']
  },
  '42205d3b-cdcc-40f6-9ab7-5309efe2eb67': {
    logicalType: 'AVALIACAO',
    objective: 'Consolidar satisfacao final com a resolucao.',
    strategicValue: 'Sinal de desfecho positivo ou negativo.',
    feeds: ['HISTORICO', 'SATISFACAO', 'RETENCAO']
  },
  '658db615-8c52-4388-81d6-651bea21cf0a': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Medir preservacao do vinculo apos protocolo.',
    strategicValue: 'Aponta risco final de perda.',
    feeds: ['HISTORICO', 'RETENCAO']
  },
  'c88726e2-c32e-4d1c-9c00-0f7893d31560': {
    logicalType: 'TECNICA_OPERACIONAL',
    objective: 'Identificar o equipamento vinculado a falha.',
    strategicValue: 'Relaciona chamado a linha de produto.',
    feeds: ['HISTORICO', 'TECNICO']
  },
  'eedc608d-371c-4119-a0e4-074234f1a65a': {
    logicalType: 'TECNICA_OPERACIONAL',
    objective: 'Priorizar a urgencia do reparo.',
    strategicValue: 'Classifica severidade tecnica.',
    feeds: ['HISTORICO', 'TECNICO']
  },
  '40e8b424-a8d9-41b2-a83f-379430e9c41a': {
    logicalType: 'TECNICA_OPERACIONAL',
    objective: 'Medir andamento do atendimento tecnico.',
    strategicValue: 'Mostra gargalo operacional do agendamento.',
    feeds: ['HISTORICO', 'TECNICO']
  },
  'beafca5a-fea6-419e-b074-3df0832219b6': {
    logicalType: 'TECNICA_OPERACIONAL',
    objective: 'Registrar descricao tecnica do defeito.',
    strategicValue: 'Agrupa defeitos recorrentes em historico.',
    feeds: ['HISTORICO', 'TECNICO']
  },
  'bd733ba7-1ff3-42ba-8622-99da94ec01c2': {
    logicalType: 'DIAGNOSTICO',
    objective: 'Descobrir a causa da inatividade.',
    strategicValue: 'Traduz churn em motivo de retorno.',
    feeds: ['HISTORICO', 'RETENCAO', 'OPORTUNIDADE_COMERCIAL']
  },
  '51642588-d2c1-48f1-a569-301c5020f354': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Mapear condicao necessaria para retomar.',
    strategicValue: 'Mostra gatilho de reativacao.',
    feeds: ['HISTORICO', 'RETENCAO', 'OPORTUNIDADE_COMERCIAL']
  },
  '5431ade9-543a-4c7d-8b33-596d4b243fd9': {
    logicalType: 'ACOMPANHAMENTO',
    objective: 'Estimar prazo de reativacao.',
    strategicValue: 'Organiza janela de retorno.',
    feeds: ['HISTORICO', 'RETENCAO', 'OPORTUNIDADE_COMERCIAL']
  },
  '7a6a106f-5079-42af-8d4f-d7a136c82999': {
    logicalType: 'RECUPERACAO_RETENCAO',
    objective: 'Confirmar interesse real de retomar.',
    strategicValue: 'Sinal decisivo de reativacao.',
    feeds: ['HISTORICO', 'RETENCAO', 'OPORTUNIDADE_COMERCIAL']
  },
  'f7656f06-1421-4384-991a-02aabb409dc4': {
    logicalType: 'OPORTUNIDADE_COMERCIAL',
    objective: 'Registrar linha exploravel percebida na ligacao.',
    strategicValue: 'Alimenta inteligencia transversal de oferta.',
    feeds: ['HISTORICO', 'OPORTUNIDADE_COMERCIAL'],
    eligibleCallTypes: MAIN_CALL_TYPES,
    primaryDataField: 'interest_product'
  },
  'd48d2b9d-2d95-4f98-a71b-aa9d47edec1b': {
    logicalType: 'CADASTRAL',
    objective: 'Completar cadastro com e-mail valido.',
    strategicValue: 'Aumenta qualidade cadastral em qualquer fluxo.',
    feeds: ['CADASTRO', 'HISTORICO'],
    eligibleCallTypes: MAIN_CALL_TYPES,
    displayCondition: 'MISSING_EMAIL',
    primaryDataField: 'email'
  }
};

const INTEREST_KEYWORDS: Array<{ line: InterestLine; tags: string[]; keywords: string[] }> = [
  {
    line: 'QUIMICOS',
    tags: ['INTERESSE_QUIMICOS'],
    keywords: ['quimic', 'cloro', 'algicida', 'barrilha', 'tratamento de agua', 'tratamento piscina', 'ph']
  },
  {
    line: 'FOTOVOLTAICO',
    tags: ['INTERESSE_FOTOVOLTAICO'],
    keywords: ['fotovolta', 'energia solar', 'placa solar', 'painel solar', 'inversor']
  },
  {
    line: 'LINHA BANHO',
    tags: ['INTERESSE_LINHA_BANHO'],
    keywords: ['linha banho', 'banho', 'chuveiro', 'ducha', 'boiler', 'pressurizador', 'agua quente banho']
  },
  {
    line: 'LINHA PISCINA',
    tags: ['INTERESSE_LINHA_PISCINA'],
    keywords: ['piscina', 'bomba piscina', 'filtro piscina', 'cascata', 'spa']
  },
  {
    line: 'AQUECEDORES',
    tags: ['INTERESSE_AQUECEDORES'],
    keywords: ['aquecedor', 'aquecimento', 'aquecer', 'caldeira']
  }
];

export const getQuestionBusinessRule = (questionId?: string | null) =>
  questionId ? QUESTION_RULES[questionId] : undefined;

const getQuestionEligibleCallTypes = (question: Question, rule?: QuestionBusinessRuleMeta) => {
  if (rule?.eligibleCallTypes && rule.eligibleCallTypes.length > 0) {
    return rule.eligibleCallTypes;
  }

  const normalizedType = normalizeQuestionnaireCallType(String(question.type || CALL_TYPE_ALL));
  if (normalizedType === CALL_TYPE_ALL || !normalizedType) {
    return MAIN_CALL_TYPES;
  }

  const eligible = [normalizedType];
  if (rule?.extraCallTypes?.length) {
    eligible.push(...rule.extraCallTypes);
  }

  return Array.from(new Set(eligible));
};

const shouldDisplayByCondition = (
  condition: QuestionBusinessRuleMeta['displayCondition'],
  context?: QuestionnaireQuestionDisplayContext
) => {
  const responses = context?.responses || {};
  const clientContext = context?.clientContext;

  switch (condition) {
    case 'MISSING_EMAIL':
      return hasValidEmail(responses.email_cliente)
        || hasValidEmail(responses.email)
        || !hasValidEmail(clientContext?.email || undefined);
    case 'MISSING_BUYER_NAME':
      return hasMeaningfulValue(responses.buyer_name)
        || hasMeaningfulValue(responses.nome_comprador)
        || !hasMeaningfulValue(clientContext?.buyerName);
    case 'MISSING_RESPONSIBLE_PHONE':
      return hasMeaningfulValue(responses.responsible_phone)
        || hasMeaningfulValue(responses.telefone_responsavel)
        || !hasMeaningfulValue(clientContext?.responsiblePhone);
    case 'ALWAYS':
    default:
      return true;
  }
};

export const shouldDisplayQuestionForContext = (
  question: Question,
  callType?: string | null,
  proposito?: string | null,
  context?: QuestionnaireQuestionDisplayContext
) => {
  const normalizedCallType = normalizeQuestionnaireCallType(callType || CALL_TYPE_ALL);
  const normalizedQuestionType = normalizeQuestionnaireCallType(String(question.type || CALL_TYPE_ALL));
  const rule = getQuestionBusinessRule(question.id);

  if (question.proposito && question.proposito !== proposito) {
    return false;
  }

  const eligibleCallTypes = getQuestionEligibleCallTypes(question, rule);
  const matchesCallType =
    !callType ||
    normalizedCallType === CALL_TYPE_ALL ||
    normalizedQuestionType === CALL_TYPE_ALL ||
    eligibleCallTypes.includes(normalizedCallType);

  if (!matchesCallType) return false;

  return shouldDisplayByCondition(rule?.displayCondition, context);
};

const classifyInterestLine = (value: unknown): { line?: InterestLine; tags: string[]; keywords: string[] } => {
  const normalized = normalizeText(value);
  if (!normalized || normalized === 'nao' || normalized === 'nenhum') {
    return { tags: [], keywords: [] };
  }

  for (const candidate of INTEREST_KEYWORDS) {
    const matchedKeywords = candidate.keywords.filter(keyword => normalized.includes(keyword));
    if (matchedKeywords.length > 0) {
      return {
        line: candidate.line,
        tags: candidate.tags,
        keywords: matchedKeywords
      };
    }
  }

  return {
    line: 'OUTROS',
    tags: [],
    keywords: []
  };
};

const lineToLabel = (line?: InterestLine) => {
  switch (line) {
    case 'QUIMICOS':
      return 'QUIMICOS';
    case 'FOTOVOLTAICO':
      return 'FOTOVOLTAICO';
    case 'LINHA BANHO':
      return 'LINHA BANHO';
    case 'LINHA PISCINA':
      return 'LINHA PISCINA';
    case 'AQUECEDORES':
      return 'AQUECEDORES';
    default:
      return undefined;
  }
};

const scoreByAnswer = (value: unknown, answers: Record<string, number>, defaultScore = 50) => {
  const normalized = normalizeText(value);
  if (!normalized) return defaultScore;
  return answers[normalized] ?? defaultScore;
};

const classifyCommercialTiming = (
  value: unknown,
  kind: 'investimento' | 'reativacao' | 'decisao'
): { interpretedValue?: string; tags: string[]; score: number } => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return { tags: [], score: 50 };
  }

  const isImmediate =
    normalized.includes('imediato') ||
    normalized.includes('agora') ||
    normalized.includes('hoje') ||
    normalized.includes('essa semana') ||
    normalized.includes('esta semana') ||
    normalized.includes('curto prazo');
  const isMedium =
    normalized.includes('30 dias') ||
    normalized.includes('proximos 30 dias') ||
    normalized.includes('proximas semanas') ||
    normalized.includes('1 mes') ||
    normalized.includes('um mes') ||
    normalized.includes('medio prazo');

  if (kind === 'investimento') {
    if (normalized === 'imediato' || isImmediate) {
      return { interpretedValue: 'INVESTIMENTO_IMEDIATO', tags: ['LEAD_QUENTE'], score: 90 };
    }
    if (normalized === 'proximos 30 dias' || isMedium) {
      return { interpretedValue: 'INVESTIMENTO_30_DIAS', tags: ['FOLLOWUP_30_DIAS', 'LEAD_MORNO'], score: 70 };
    }
    return { interpretedValue: 'SEM_PREVISAO', tags: ['LEAD_NUTRICAO', 'LEAD_FRIO'], score: 30 };
  }

  if (kind === 'decisao') {
    if (isImmediate) {
      return { interpretedValue: 'DECISAO_CURTO_PRAZO', tags: ['FOLLOWUP_CURTO_PRAZO'], score: 85 };
    }
    if (isMedium) {
      return { interpretedValue: 'DECISAO_MEDIO_PRAZO', tags: ['FOLLOWUP_MEDIO_PRAZO'], score: 60 };
    }
    return { interpretedValue: 'SEM_PRAZO_DEFINIDO', tags: ['SEM_PRAZO_DEFINIDO'], score: 35 };
  }

  if (isImmediate) {
    return { interpretedValue: 'RETORNO_CURTO_PRAZO', tags: ['RETORNO_CURTO_PRAZO', 'LEAD_QUENTE'], score: 85 };
  }
  if (isMedium) {
    return { interpretedValue: 'RETORNO_MEDIO_PRAZO', tags: ['RETORNO_MEDIO_PRAZO', 'LEAD_MORNO'], score: 60 };
  }
  return { interpretedValue: 'RETORNO_LONGO_PRAZO', tags: ['RETORNO_LONGO_PRAZO', 'LEAD_FRIO'], score: 35 };
};

const classifyCurrentSolution = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags: string[] = [];
  const keywords: string[] = [];

  if (!normalized) {
    return { interpretedValue: undefined, tags, keywords, score: 50 };
  }

  if (normalized.includes('concorr') || normalized.includes('fornecedor atual') || normalized.includes('outra empresa')) {
    tags.push('USA_CONCORRENTE');
    keywords.push('concorrente');
    return { interpretedValue: 'USA_CONCORRENTE', tags, keywords, score: 55 };
  }

  if (normalized.includes('intern') || normalized.includes('equipe propria') || normalized.includes('conta propria')) {
    tags.push('RESOLVE_INTERNAMENTE');
    keywords.push('internamente');
    return { interpretedValue: 'RESOLVE_INTERNAMENTE', tags, keywords, score: 40 };
  }

  if (normalized.includes('nao resolve') || normalized.includes('sem solucao') || normalized.includes('nao tem') || normalized.includes('ainda nao')) {
    tags.push('SEM_SOLUCAO_ATUAL');
    keywords.push('sem solucao');
    return { interpretedValue: 'SEM_SOLUCAO_ATUAL', tags, keywords, score: 85 };
  }

  if (normalized.includes('improvis') || normalized.includes('gambiarra') || normalized.includes('adapt')) {
    tags.push('SEM_SOLUCAO_ATUAL');
    keywords.push('improviso');
    return { interpretedValue: 'IMPROVISA', tags, keywords, score: 75 };
  }

  return { interpretedValue: 'CENARIO_MAPEADO', tags, keywords, score: 50 };
};

const classifyAttendanceProblem = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags = ['FALHA_ATENDIMENTO'];
  const keywords: string[] = [];

  if (!normalized) {
    return { interpretedValue: undefined, tags: [], keywords, score: 50 };
  }

  if (normalized.includes('demora') || normalized.includes('demorou') || normalized.includes('sem retorno') || normalized.includes('falta de retorno')) {
    tags.push('DEMORA_RETORNO');
    keywords.push('demora');
  }

  if (normalized.includes('grosser') || normalized.includes('mal educ') || normalized.includes('rude') || normalized.includes('atendimento ruim')) {
    tags.push('POSTURA_RUIM');
    keywords.push('postura');
  }

  if (
    normalized.includes('informacao errada') ||
    normalized.includes('informacao incorreta') ||
    normalized.includes('passou errado') ||
    normalized.includes('promessa nao cumprida')
  ) {
    tags.push('INFORMACAO_INCORRETA');
    keywords.push('informacao');
  }

  return {
    interpretedValue: tags.length > 1 ? tags.filter(tag => tag !== 'FALHA_ATENDIMENTO').join(', ') : 'FALHA_ATENDIMENTO',
    tags,
    keywords,
    score: 20
  };
};

const classifyRecoveryExpectation = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags = ['ACAO_ESPERADA_PELO_CLIENTE'];
  const keywords: string[] = [];
  let score = 55;

  if (!normalized) {
    return { interpretedValue: undefined, tags: [], keywords, score: 50 };
  }

  if (normalized.includes('reembolso') || normalized.includes('cancel')) {
    keywords.push('reembolso');
    score = 15;
  } else if (
    normalized.includes('retorno') ||
    normalized.includes('contato') ||
    normalized.includes('visita') ||
    normalized.includes('troca') ||
    normalized.includes('reparo') ||
    normalized.includes('solucao')
  ) {
    keywords.push('solucao');
    score = 80;
  }

  return { interpretedValue: normalized, tags, keywords, score };
};

const classifyExecutionFailure = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags = ['FALHA_EXECUCAO'];
  const keywords: string[] = [];

  if (!normalized) {
    return { interpretedValue: undefined, tags: [], keywords, score: 50 };
  }

  ['instalacao', 'acabamento', 'pendencia', 'erro tecnico', 'atraso', 'incompleto']
    .filter(keyword => normalized.includes(keyword))
    .forEach(keyword => keywords.push(keyword));

  return {
    interpretedValue: keywords.length > 0 ? keywords.join(', ') : normalized,
    tags,
    keywords,
    score: 20
  };
};

const classifyProductProblem = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags = ['FALHA_PRODUTO'];
  const keywords: string[] = [];

  if (!normalized) {
    return { interpretedValue: undefined, tags: [], keywords, score: 50 };
  }

  ['defeito', 'desempenho', 'compatibilidade', 'dano', 'uso incorreto']
    .filter(keyword => normalized.includes(keyword))
    .forEach(keyword => keywords.push(keyword));

  return {
    interpretedValue: keywords.length > 0 ? keywords.join(', ') : normalized,
    tags,
    keywords,
    score: 20
  };
};

const classifyTechnicalDefect = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags = ['DEFEITO_TECNICO_DESCRITO'];
  const keywords: string[] = [];
  let score = 55;

  if (!normalized) {
    return { interpretedValue: undefined, tags: [], keywords, score: 50 };
  }

  ['vazamento', 'parado', 'nao liga', 'nao aquece', 'quebrado', 'queimou']
    .filter(keyword => normalized.includes(keyword))
    .forEach(keyword => keywords.push(keyword));

  if (
    normalized.includes('parado') ||
    normalized.includes('urgente') ||
    normalized.includes('queimou') ||
    normalized.includes('sem funcionar')
  ) {
    score = 85;
    tags.push('CASO_TECNICO_URGENTE');
  }

  return {
    interpretedValue: keywords.length > 0 ? keywords.join(', ') : normalized,
    tags,
    keywords,
    score
  };
};

const classifyReactivationReason = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags: string[] = [];
  const keywords: string[] = [];
  let score = 40;

  if (!normalized) {
    return { interpretedValue: undefined, tags, keywords, score: 50 };
  }

  if (normalized.includes('preco') || normalized.includes('barato')) {
    tags.push('MOTIVO_SAIDA_PRECO');
    keywords.push('preco');
    score = 25;
  }
  if (normalized.includes('atendimento') || normalized.includes('retorno')) {
    tags.push('MOTIVO_SAIDA_ATENDIMENTO');
    keywords.push('atendimento');
    score = 20;
  }
  if (normalized.includes('concorr')) {
    tags.push('MOTIVO_SAIDA_CONCORRENCIA');
    keywords.push('concorrencia');
    score = 30;
  }
  if (normalized.includes('nao precisava') || normalized.includes('sem necessidade') || normalized.includes('parou de precisar')) {
    tags.push('MOTIVO_SAIDA_SEM_NECESSIDADE');
    keywords.push('sem necessidade');
    score = 55;
  }
  if (normalized.includes('problema') || normalized.includes('defeito') || normalized.includes('atraso')) {
    tags.push('MOTIVO_SAIDA_PROBLEMA_ANTERIOR');
    keywords.push('problema anterior');
    score = 15;
  }

  return {
    interpretedValue: tags.join(', ') || normalized,
    tags,
    keywords,
    score
  };
};

const classifyReactivationCondition = (value: unknown) => {
  const normalized = normalizeText(value);
  const tags = ['CONDICAO_RETORNO_MAPEADA'];
  const keywords: string[] = [];
  let score = 60;

  if (!normalized) {
    return { interpretedValue: undefined, tags: [], keywords, score: 50 };
  }

  ['desconto', 'preco', 'proposta', 'confianca', 'prazo', 'atendimento', 'contato']
    .filter(keyword => normalized.includes(keyword))
    .forEach(keyword => keywords.push(keyword));

  if (keywords.includes('confianca') || keywords.includes('atendimento')) {
    score = 55;
  }
  if (keywords.includes('proposta') || keywords.includes('contato')) {
    score = 75;
  }

  return {
    interpretedValue: normalized,
    tags,
    keywords,
    score
  };
};

const parseDelayDays = (value: unknown) => {
  const digits = String(value || '').match(/\d+/g);
  const total = digits ? Number.parseInt(digits[0], 10) : Number.NaN;

  if (!Number.isFinite(total)) {
    return { interpretedValue: undefined, tags: [], score: 50 };
  }

  if (total >= 30) return { interpretedValue: `${total} dias`, tags: ['ATRASO_REPORTADO'], score: 95 };
  if (total >= 10) return { interpretedValue: `${total} dias`, tags: ['ATRASO_REPORTADO'], score: 80 };
  if (total > 0) return { interpretedValue: `${total} dias`, tags: ['ATRASO_REPORTADO'], score: 60 };
  return { interpretedValue: 'SEM_ATRASO', tags: [], score: 30 };
};

const createIndexBag = () =>
  Object.fromEntries(INDEX_KEYS.map(key => [key, { total: 0, weight: 0 }])) as Record<
    QuestionnaireIndexKey,
    { total: number; weight: number }
  >;

const addIndexScore = (
  bag: Record<QuestionnaireIndexKey, { total: number; weight: number }>,
  key: QuestionnaireIndexKey,
  score: number,
  weight = 1
) => {
  bag[key].total += score * weight;
  bag[key].weight += weight;
};

const addSignalIndexScore = (
  signal: QuestionnaireBusinessQuestionSignal,
  key: QuestionnaireIndexKey,
  score: number,
  weight = 1
) => {
  signal.indices[key] = { score, weight };
};

const addIndexSet = (
  bag: Record<QuestionnaireIndexKey, { total: number; weight: number }>,
  signal: QuestionnaireBusinessQuestionSignal,
  scores: Array<{ key: QuestionnaireIndexKey; score: number; weight?: number }>
) => {
  scores.forEach(({ key, score, weight = 1 }) => {
    addIndexScore(bag, key, score, weight);
    addSignalIndexScore(signal, key, score, weight);
  });
};

const pushTag = (target: Set<string>, tag?: string) => {
  if (tag) target.add(tag);
};

const startSignal = (question: Question, answer: unknown): QuestionnaireBusinessQuestionSignal => {
  const rule = getQuestionBusinessRule(question.id);
  const eligibleCallTypes = getQuestionEligibleCallTypes(question, rule);

  return {
    questionId: question.id,
    questionText: question.text,
    logicalType: rule?.logicalType || 'DIAGNOSTICO',
    objective: rule?.objective || 'Pergunta reconhecida pelo motor de negocio.',
    strategicValue: rule?.strategicValue || 'Registra contexto relevante de negocio.',
    eligibleCallTypes,
    feeds: rule?.feeds || ['HISTORICO'],
    answer,
    interpretedValue: undefined,
    tags: [],
    indices: {},
    keywords: [],
    capturedData: {}
  };
};

const createQuestionMap = (questions: Question[] = []) =>
  new Map<string, Question>(questions.map(question => [question.id, question]));

const fallbackQuestionFromRule = (questionId: string): Question => ({
  id: questionId,
  text: questionId,
  options: [],
  type: 'ALL',
  order: 0
});

const getQuestionKeysToAnalyze = (responses: Record<string, any>, questionMap: Map<string, Question>) => {
  const keys = new Set<string>(questionMap.keys());

  Object.keys(QUESTION_RULES).forEach(questionId => {
    const mappedQuestion = questionMap.get(questionId);
    if (mappedQuestion && hasMeaningfulValue(resolveStoredQuestionValue(mappedQuestion, responses))) {
      keys.add(questionId);
      return;
    }

    if (hasMeaningfulValue(responses[questionId])) {
      keys.add(questionId);
    }
  });

  return Array.from(keys);
};

const classifyClientProfile = (
  tags: Set<string>,
  indices: Record<QuestionnaireIndexKey, number>,
  capturedData: QuestionnaireBusinessContext['capturedData']
): QuestionnaireBusinessProfile => {
  const profile: QuestionnaireBusinessProfile = { ...neutralProfile };

  if (indices.indice_satisfacao >= 75 || tags.has('RELACIONAMENTO_POSITIVO')) {
    profile.clientePerfil = 'CLIENTE_AVALIA_BEM';
  } else if (indices.indice_satisfacao <= 35 || tags.has('SATISFACAO_BAIXA') || tags.has('RECLAMACAO_GRAVE')) {
    profile.clientePerfil = 'CLIENTE_AVALIA_MAL';
  } else if (indices.indice_satisfacao !== 50) {
    profile.clientePerfil = 'CLIENTE_NEUTRO';
  }

  if (
    indices.indice_retencao >= 70 ||
    indices.indice_recuperabilidade >= 70 ||
    tags.has('CLIENTE_RECUPERAVEL') ||
    tags.has('CLIENTE_REATIVAVEL')
  ) {
    profile.retencaoPerfil = 'CLIENTE_RECUPERAVEL';
  } else if (indices.indice_risco_perda >= 70 || tags.has('RISCO_DE_PERDA') || tags.has('RETENCAO_BAIXA')) {
    profile.retencaoPerfil = 'CLIENTE_EM_RISCO_DE_PERDA';
  }

  if (indices.indice_interesse_comercial >= 70 || indices.indice_oportunidade_upsell >= 70 || tags.has('OPORTUNIDADE_COMERCIAL')) {
    profile.comercialPerfil = 'CLIENTE_EXPLORAVEL_COMERCIALMENTE';
  } else if (tags.has('LEAD_MORNO') || (indices.indice_interesse_comercial > 45 && indices.indice_interesse_comercial < 70)) {
    profile.comercialPerfil = 'LEAD_MORNO';
  } else if (tags.has('LEAD_FRIO') || indices.indice_interesse_comercial < 45) {
    profile.comercialPerfil = 'LEAD_FRIO';
  }

  if (tags.has('LEAD_QUENTE')) profile.leadTemperatura = 'LEAD_QUENTE';
  else if (tags.has('LEAD_MORNO')) profile.leadTemperatura = 'LEAD_MORNO';
  else if (tags.has('LEAD_FRIO') || tags.has('LEAD_NUTRICAO')) profile.leadTemperatura = 'LEAD_FRIO';

  if (capturedData.email && capturedData.buyerName && capturedData.responsiblePhone) {
    profile.cadastroPerfil = 'CADASTRO_RICO';
  } else {
    profile.cadastroPerfil = 'CADASTRO_POBRE';
  }

  return profile;
};

export const buildQuestionnaireBusinessContext = ({
  responses = {},
  questions = [],
  callType,
  proposito,
  clientContext
}: {
  responses?: Record<string, any>;
  questions?: Question[];
  callType?: string | null;
  proposito?: string | null;
  clientContext?: QuestionnaireBusinessClientContext | Partial<Client> | null;
}): QuestionnaireBusinessContext => {
  const normalizedClientContext =
    clientContext && ('buyer_name' in clientContext || 'responsible_phone' in clientContext || 'email' in clientContext || 'status' in clientContext)
      ? buildClientContextFromClient(clientContext as Partial<Client>)
      : (clientContext as QuestionnaireBusinessClientContext | undefined) || {};

  const questionMap = createQuestionMap(questions);
  const signals: QuestionnaireBusinessQuestionSignal[] = [];
  const tags = new Set<string>();
  const feeds = new Set<QuestionnaireBusinessFeed>();
  const indexBag = createIndexBag();
  const capturedData: QuestionnaireBusinessContext['capturedData'] = {
    email: sanitizeEmail(normalizedClientContext.email),
    buyerName: sanitizeText(normalizedClientContext.buyerName),
    responsiblePhone: sanitizePhone(normalizedClientContext.responsiblePhone)
  };
  const questionIds = getQuestionKeysToAnalyze(responses, questionMap);

  for (const questionId of questionIds) {
    const question = questionMap.get(questionId) || fallbackQuestionFromRule(questionId);
    if (!shouldDisplayQuestionForContext(question, callType, proposito, { clientContext: normalizedClientContext, responses })) {
      continue;
    }

    const answer = resolveStoredQuestionValue(question, responses);
    if (!hasMeaningfulValue(answer)) continue;

    const signal = startSignal(question, answer);
    signal.feeds.forEach(feed => feeds.add(feed));
    const normalizedAnswer = normalizeText(answer);

    switch (question.id) {
      case 'e029be6a-7f8f-4508-ba9e-d59313415fd5':
        signal.interpretedValue = normalizedAnswer === 'sim'
          ? 'FALOU_COM_DECISOR'
          : normalizedAnswer === 'em partes'
            ? 'ACESSO_PARCIAL_AO_DECISOR'
            : 'SEM_ACESSO_AO_DECISOR';
        if (normalizedAnswer === 'sim') {
          signal.tags.push('CADASTRO_COM_DECISOR_POTENCIAL', 'PROSPECCAO_QUALIFICADA');
          addIndexSet(indexBag, signal, [
            { key: 'indice_interesse_comercial', score: 85, weight: 2 },
            { key: 'indice_qualidade_cadastro', score: 80, weight: 1 }
          ]);
        } else if (normalizedAnswer === 'em partes') {
          signal.tags.push('DECISOR_PARCIAL');
          addIndexSet(indexBag, signal, [
            { key: 'indice_interesse_comercial', score: 60, weight: 2 },
            { key: 'indice_qualidade_cadastro', score: 55, weight: 1 }
          ]);
        } else {
          signal.tags.push('SEM_ACESSO_AO_DECISOR');
          addIndexSet(indexBag, signal, [
            { key: 'indice_interesse_comercial', score: 25, weight: 2 },
            { key: 'indice_qualidade_cadastro', score: 30, weight: 1 }
          ]);
        }
        break;
      case '8868c7a3-5a0f-4537-9fab-3f61be064e36': {
        const buyerName = sanitizeText(answer);
        if (buyerName) {
          signal.tags.push('CADASTRO_COM_DECISOR');
          signal.capturedData.buyer_name = buyerName;
          capturedData.buyerName = capturedData.buyerName || buyerName;
          addIndexSet(indexBag, signal, [{ key: 'indice_qualidade_cadastro', score: 90, weight: 2 }]);
        }
        break;
      }
      case '7ed45177-702a-4575-b227-b56c6af80737': {
        const phone = sanitizePhone(answer);
        if (phone) {
          signal.tags.push('CADASTRO_COM_WHATSAPP');
          signal.capturedData.responsible_phone = phone;
          capturedData.responsiblePhone = capturedData.responsiblePhone || phone;
          addIndexSet(indexBag, signal, [{ key: 'indice_qualidade_cadastro', score: 90, weight: 2 }]);
        }
        break;
      }
      case '55f73fa2-f1ee-48e0-8d8c-9985ea2d58e3':
      case 'd48d2b9d-2d95-4f98-a71b-aa9d47edec1b': {
        const email = sanitizeEmail(answer);
        if (email) {
          signal.tags.push('CADASTRO_COM_EMAIL');
          signal.capturedData.email = email;
          capturedData.email = capturedData.email || email;
          addIndexSet(indexBag, signal, [{ key: 'indice_qualidade_cadastro', score: 90, weight: 2 }]);
        }
        break;
      }
      case '77e5075f-7299-4a6c-9f6f-8094396f1e24':
      case 'a5634ff2-2d80-42ec-b7fb-50c00a4a8881':
      case 'c56913ae-e933-42e6-bf58-733ed3da4d2b': {
        const interest = classifyInterestLine(answer);
        signal.tags.push(...interest.tags);
        signal.keywords.push(...interest.keywords);
        if (question.id === 'a5634ff2-2d80-42ec-b7fb-50c00a4a8881') {
          signal.tags.push('INDICACAO_QUALIFICADA');
          signal.capturedData.indicationNeed = sanitizeText(answer);
          capturedData.indicationNeed = capturedData.indicationNeed || sanitizeText(answer);
        }
        if (question.id === 'c56913ae-e933-42e6-bf58-733ed3da4d2b') {
          signal.tags.push('INTERESSE_PRODUTO_ESPECIFICO');
        }
        if (interest.line) {
          const label = lineToLabel(interest.line);
          signal.interpretedValue = label || interest.line;
          if (label) {
            signal.capturedData.interest_product = label;
            capturedData.interestProduct = capturedData.interestProduct || label;
          }
        }
        addIndexSet(indexBag, signal, [
          { key: 'indice_interesse_comercial', score: interest.line ? 85 : 65, weight: 2 },
          { key: 'indice_oportunidade_upsell', score: interest.line ? 80 : 55, weight: 2 }
        ]);
        break;
      }
      case '9144c4d1-f22e-4e79-a51b-127c771d8101': {
        const classification = classifyCurrentSolution(answer);
        signal.interpretedValue = classification.interpretedValue;
        signal.tags.push(...classification.tags);
        signal.keywords.push(...classification.keywords);
        addIndexSet(indexBag, signal, [
          { key: 'indice_interesse_comercial', score: classification.score, weight: 1 },
          { key: 'indice_oportunidade_upsell', score: classification.score, weight: 1 }
        ]);
        break;
      }
      case 'eddaa6ae-3bbb-4324-a171-f51cd2f37684': {
        const timing = classifyCommercialTiming(answer, 'investimento');
        signal.interpretedValue = timing.interpretedValue;
        signal.tags.push(...timing.tags);
        addIndexSet(indexBag, signal, [
          { key: 'indice_interesse_comercial', score: timing.score, weight: 2 },
          { key: 'indice_oportunidade_upsell', score: timing.score, weight: 1 }
        ]);
        break;
      }
      case 'a7851594-7661-4f00-bbd4-1e6647a6bd48': {
        const indicationName = sanitizeText(answer);
        if (indicationName) {
          signal.tags.push('OPORTUNIDADE_INDICACAO');
          signal.capturedData.indicationName = indicationName;
          capturedData.indicationName = capturedData.indicationName || indicationName;
          addIndexSet(indexBag, signal, [{ key: 'indice_interesse_comercial', score: 75, weight: 1 }]);
        }
        break;
      }
      case '25e1e211-2533-4479-b383-c0359cfdd105': {
        const indicationPhone = sanitizePhone(answer);
        if (indicationPhone) {
          signal.tags.push('INDICACAO_COM_CONTATO');
          signal.capturedData.indicationPhone = indicationPhone;
          capturedData.indicationPhone = capturedData.indicationPhone || indicationPhone;
          addIndexSet(indexBag, signal, [{ key: 'indice_qualidade_cadastro', score: 75, weight: 1 }]);
        }
        break;
      }
      case '2ad8652b-71c2-4d5a-a8b6-3a94ae6cbe1a':
        if (normalizedAnswer === 'alto') signal.tags.push('LEAD_QUENTE');
        if (normalizedAnswer === 'medio') signal.tags.push('LEAD_MORNO');
        if (normalizedAnswer === 'baixo') signal.tags.push('LEAD_FRIO');
        addIndexSet(indexBag, signal, [{
          key: 'indice_interesse_comercial',
          score: scoreByAnswer(answer, { alto: 90, medio: 65, baixo: 20 }),
          weight: 2
        }]);
        break;
      case 'd5cd79dd-bc41-4014-bd77-d0167825c060': {
        const score = scoreByAnswer(answer, {
          preco: 40,
          prazo: 45,
          confianca: 35,
          'nao precisa agora': 25,
          outro: 35
        });
        signal.interpretedValue = normalizedAnswer;
        if (normalizedAnswer === 'preco') signal.tags.push('OBJECAO_PRECO');
        if (normalizedAnswer === 'prazo') signal.tags.push('OBJECAO_PRAZO');
        if (normalizedAnswer === 'confianca') signal.tags.push('OBJECAO_CONFIANCA');
        if (normalizedAnswer === 'nao precisa agora') signal.tags.push('OBJECAO_TIMING');
        addIndexSet(indexBag, signal, [{ key: 'indice_interesse_comercial', score, weight: 2 }]);
        break;
      }
      case '41b1853b-b41b-4abd-9c96-27037be94d2a':
        if (normalizedAnswer === 'sim') signal.tags.push('ORCAMENTO_CONFIRMADO');
        if (normalizedAnswer === 'talvez') signal.tags.push('ORCAMENTO_INCERTO');
        if (normalizedAnswer === 'nao') signal.tags.push('SEM_ORCAMENTO');
        addIndexSet(indexBag, signal, [{
          key: 'indice_interesse_comercial',
          score: scoreByAnswer(answer, { sim: 85, talvez: 55, nao: 15 }),
          weight: 2
        }]);
        break;
      case '2d5a95aa-46d0-46ab-96ab-c816e0e024e4': {
        const timing = classifyCommercialTiming(answer, 'decisao');
        signal.interpretedValue = timing.interpretedValue;
        signal.tags.push(...timing.tags);
        addIndexSet(indexBag, signal, [{ key: 'indice_interesse_comercial', score: timing.score, weight: 1 }]);
        break;
      }
      case '47f86d94-ca65-47db-907c-42502023283d':
        if (normalizedAnswer === 'otimo') signal.tags.push('SATISFACAO_ALTA');
        if (normalizedAnswer === 'ok') signal.tags.push('SATISFACAO_NEUTRA');
        if (normalizedAnswer === 'precisa melhorar') signal.tags.push('FALHA_ATENDIMENTO');
        addIndexSet(indexBag, signal, [{
          key: 'indice_satisfacao',
          score: scoreByAnswer(answer, { otimo: 90, ok: 55, 'precisa melhorar': 20 }),
          weight: 2
        }]);
        break;
      case '8c1901f1-9dc7-478f-8c4b-4b526fb7cfa4':
        if (normalizedAnswer === 'sim') signal.tags.push('CONFIANCA_TECNICA_ALTA');
        if (normalizedAnswer === 'parcial') signal.tags.push('CONFIANCA_TECNICA_PARCIAL');
        if (normalizedAnswer === 'nao') signal.tags.push('CONFIANCA_TECNICA_BAIXA');
        addIndexSet(indexBag, signal, [
          {
            key: 'indice_satisfacao',
            score: scoreByAnswer(answer, { sim: 85, parcial: 55, nao: 20 }),
            weight: 2
          },
          {
            key: 'indice_gravidade_operacional',
            score: scoreByAnswer(answer, { sim: 20, parcial: 55, nao: 80 }),
            weight: 1
          }
        ]);
        break;
      case 'b58f3257-c0c9-43b8-9e63-b0304b6072db':
      case '5a1a0efa-103d-4948-9914-6432d91cca05': {
        const isSolutionDeadline = question.id === '5a1a0efa-103d-4948-9914-6432d91cca05';
        if (normalizedAnswer === 'no prazo') signal.tags.push(isSolutionDeadline ? 'PRAZO_SOLUCAO_OK' : 'ENTREGA_OK');
        if (normalizedAnswer === 'pequeno atraso') signal.tags.push(isSolutionDeadline ? 'PRAZO_SOLUCAO_ATENCAO' : 'ATRASO_LEVE');
        if (normalizedAnswer === 'com problema') signal.tags.push(isSolutionDeadline ? 'PRAZO_SOLUCAO_PROBLEMA' : 'FALHA_PRAZO');
        addIndexSet(indexBag, signal, [
          {
            key: 'indice_satisfacao',
            score: scoreByAnswer(answer, { 'no prazo': 85, 'pequeno atraso': 55, 'com problema': 20 }),
            weight: 2
          },
          {
            key: 'indice_gravidade_operacional',
            score: scoreByAnswer(answer, { 'no prazo': 20, 'pequeno atraso': 55, 'com problema': 85 }),
            weight: 2
          }
        ]);
        break;
      }
      case 'e2870432-334d-4e49-b7c0-3c369ea8ff54':
        if (normalizedAnswer === 'atendeu') signal.tags.push('PRODUTO_APROVADO');
        if (normalizedAnswer === 'parcial') signal.tags.push('PRODUTO_PARCIAL');
        if (normalizedAnswer === 'nao atendeu') signal.tags.push('PRODUTO_REPROVADO');
        addIndexSet(indexBag, signal, [{
          key: 'indice_satisfacao',
          score: scoreByAnswer(answer, { atendeu: 85, parcial: 55, 'nao atendeu': 15 }),
          weight: 2
        }]);
        break;
      case '08011904-21ff-4206-9aa9-be9e8f95cda2':
        if (normalizedAnswer === 'nao') signal.tags.push('USO_SEM_DIFICULDADE');
        if (normalizedAnswer === 'leve') signal.tags.push('DIFICULDADE_LEVE');
        if (normalizedAnswer === 'sim, teve dificuldades') signal.tags.push('DIFICULDADE_RELEVANTE');
        addIndexSet(indexBag, signal, [
          {
            key: 'indice_satisfacao',
            score: scoreByAnswer(answer, { nao: 85, leve: 55, 'sim, teve dificuldades': 25 }),
            weight: 1
          },
          {
            key: 'indice_gravidade_operacional',
            score: scoreByAnswer(answer, { nao: 20, leve: 45, 'sim, teve dificuldades': 70 }),
            weight: 1
          }
        ]);
        break;
      case '4fb97f9f-e19e-4748-b703-938ad5da1259':
        if (normalizedAnswer === 'sim') signal.tags.push('NPS_POSITIVO');
        if (normalizedAnswer === 'talvez') signal.tags.push('NPS_NEUTRO');
        if (normalizedAnswer === 'nao') signal.tags.push('NPS_NEGATIVO');
        addIndexSet(indexBag, signal, [
          {
            key: 'indice_satisfacao',
            score: scoreByAnswer(answer, { sim: 95, talvez: 55, nao: 10 }),
            weight: 3
          },
          {
            key: 'indice_risco_perda',
            score: scoreByAnswer(answer, { sim: 15, talvez: 55, nao: 90 }),
            weight: 2
          }
        ]);
        break;
      case 'fd580427-df50-40e4-b48a-3ea484a36137': {
        const tagMap: Record<string, string> = {
          negociacao: 'INSATISFACAO_NEGOCIACAO',
          garantia: 'INSATISFACAO_GARANTIA',
          'atraso na execucao': 'INSATISFACAO_EXECUCAO',
          'atraso na entrega': 'INSATISFACAO_ENTREGA',
          'defeito no equipamento': 'INSATISFACAO_EQUIPAMENTO',
          'defeito na instalacao': 'INSATISFACAO_INSTALACAO',
          'venda incompleta': 'INSATISFACAO_VENDA_INCOMPLETA',
          atendimento: 'INSATISFACAO_ATENDIMENTO'
        };
        if (tagMap[normalizedAnswer]) signal.tags.push(tagMap[normalizedAnswer]);
        addIndexSet(indexBag, signal, [
          { key: 'indice_risco_perda', score: 80, weight: 2 },
          { key: 'indice_gravidade_operacional', score: 70, weight: 1 },
          { key: 'indice_satisfacao', score: 20, weight: 2 }
        ]);
        break;
      }
      case '13d8a0f3-1917-4fa6-a6cb-29e4b9b1e919': {
        const classification = classifyAttendanceProblem(answer);
        signal.interpretedValue = classification.interpretedValue;
        signal.tags.push(...classification.tags);
        signal.keywords.push(...classification.keywords);
        addIndexSet(indexBag, signal, [
          { key: 'indice_satisfacao', score: classification.score, weight: 2 },
          { key: 'indice_risco_perda', score: 80, weight: 1 }
        ]);
        break;
      }
      case '372a955e-71ae-4c53-9645-ca49129e7896': {
        const expectation = classifyRecoveryExpectation(answer);
        signal.interpretedValue = expectation.interpretedValue;
        signal.tags.push(...expectation.tags);
        signal.keywords.push(...expectation.keywords);
        addIndexSet(indexBag, signal, [{ key: 'indice_recuperabilidade', score: expectation.score, weight: 2 }]);
        break;
      }
      case '4447ccd4-39a8-4447-947d-0d76a407e210':
      case '04d6f4b3-977d-41a8-8d56-4d19b15fde0a':
      case '731f6de2-6970-4535-8a69-ef9bf68317e3':
      case '1d3817b1-4b23-4617-8c42-d58f404f9322':
      case '658db615-8c52-4388-81d6-651bea21cf0a': {
        const positiveTag = question.id === '658db615-8c52-4388-81d6-651bea21cf0a' ? 'RELACAO_MANTIDA' : 'CLIENTE_RECUPERAVEL';
        if (normalizedAnswer === 'sim') signal.tags.push(positiveTag);
        if (normalizedAnswer === 'nao') signal.tags.push('RISCO_DE_PERDA');
        addIndexSet(indexBag, signal, [
          { key: 'indice_retencao', score: scoreByAnswer(answer, { sim: 90, nao: 10 }), weight: 3 },
          { key: 'indice_recuperabilidade', score: scoreByAnswer(answer, { sim: 90, nao: 10 }), weight: 2 },
          { key: 'indice_risco_perda', score: scoreByAnswer(answer, { sim: 15, nao: 90 }), weight: 2 }
        ]);
        break;
      }
      case '1ffb395d-f555-4f71-a1ac-a0edd31eb757': {
        const delay = parseDelayDays(answer);
        signal.interpretedValue = delay.interpretedValue;
        signal.tags.push(...delay.tags);
        addIndexSet(indexBag, signal, [{ key: 'indice_gravidade_operacional', score: delay.score, weight: 2 }]);
        break;
      }
      case 'f3d56ad0-c632-474c-926e-e569461dad18':
        if (normalizedAnswer === 'sim') signal.tags.push('PREJUIZO_DECLARADO');
        if (normalizedAnswer === 'nao') signal.tags.push('SEM_PREJUIZO_DECLARADO');
        addIndexSet(indexBag, signal, [
          { key: 'indice_risco_perda', score: scoreByAnswer(answer, { sim: 90, nao: 25 }), weight: 2 },
          { key: 'indice_gravidade_operacional', score: scoreByAnswer(answer, { sim: 90, nao: 35 }), weight: 2 }
        ]);
        break;
      case '4a95642e-fbe7-488e-b922-b4de2a532f75': {
        const failure = classifyExecutionFailure(answer);
        signal.interpretedValue = failure.interpretedValue;
        signal.tags.push(...failure.tags);
        signal.keywords.push(...failure.keywords);
        addIndexSet(indexBag, signal, [
          { key: 'indice_gravidade_operacional', score: failure.score, weight: 2 },
          { key: 'indice_risco_perda', score: 75, weight: 1 }
        ]);
        break;
      }
      case 'ceb2c51a-5edd-495d-b84c-c321428b668e':
        if (normalizedAnswer === 'sim') signal.tags.push('TECNICO_IDENTIFICADO');
        if (normalizedAnswer === 'nao') signal.tags.push('FALHA_SISTEMICA_POTENCIAL');
        addIndexSet(indexBag, signal, [{ key: 'indice_gravidade_operacional', score: normalizedAnswer === 'sim' ? 65 : 75, weight: 1 }]);
        break;
      case '206e7727-47cb-48a7-b8f6-af9a12deac09':
        if (normalizedAnswer === 'sim') signal.tags.push('NECESSITA_RETRABALHO');
        if (normalizedAnswer === 'nao') signal.tags.push('SEM_RETRABALHO');
        addIndexSet(indexBag, signal, [
          { key: 'indice_gravidade_operacional', score: scoreByAnswer(answer, { sim: 90, nao: 30 }), weight: 2 },
          { key: 'indice_risco_perda', score: scoreByAnswer(answer, { sim: 80, nao: 35 }), weight: 1 }
        ]);
        break;
      case 'ef206cd0-ca22-4f2b-bfa2-60f25564b368': {
        const failure = classifyProductProblem(answer);
        signal.interpretedValue = failure.interpretedValue;
        signal.tags.push(...failure.tags);
        signal.keywords.push(...failure.keywords);
        addIndexSet(indexBag, signal, [
          { key: 'indice_gravidade_operacional', score: failure.score, weight: 2 },
          { key: 'indice_risco_perda', score: 80, weight: 1 }
        ]);
        break;
      }
      case '62af76ea-37e7-4332-93d6-6909e9a1afda':
        if (normalizedAnswer === 'troca') signal.tags.push('SOLICITA_TROCA');
        if (normalizedAnswer === 'reembolso') signal.tags.push('SOLICITA_REEMBOLSO');
        if (normalizedAnswer === 'reparo') signal.tags.push('SOLICITA_REPARO');
        addIndexSet(indexBag, signal, [
          {
            key: 'indice_risco_perda',
            score: scoreByAnswer(answer, { troca: 55, reembolso: 95, reparo: 60, nenhum: 40 }),
            weight: 2
          },
          {
            key: 'indice_gravidade_operacional',
            score: scoreByAnswer(answer, { troca: 80, reembolso: 85, reparo: 75, nenhum: 45 }),
            weight: 2
          }
        ]);
        break;
      case '5985512d-90e9-403a-8335-d3392262d1eb':
        if (normalizedAnswer === 'sim') signal.tags.push('PROTOCOLO_RESOLVIDO');
        if (normalizedAnswer === 'parcialmente') signal.tags.push('PROTOCOLO_PARCIAL');
        if (normalizedAnswer === 'nao') signal.tags.push('PROTOCOLO_NAO_RESOLVIDO');
        addIndexSet(indexBag, signal, [
          { key: 'indice_satisfacao', score: scoreByAnswer(answer, { sim: 85, parcialmente: 55, nao: 15 }), weight: 2 },
          { key: 'indice_recuperabilidade', score: scoreByAnswer(answer, { sim: 85, parcialmente: 55, nao: 15 }), weight: 2 }
        ]);
        break;
      case '8981f637-eeae-4a03-a671-7c9ff015c811':
        if (normalizedAnswer === 'sim') signal.tags.push('RESOLUCAO_EFETIVA');
        if (normalizedAnswer === 'parcial') signal.tags.push('RESOLUCAO_PARCIAL');
        if (normalizedAnswer === 'nao') signal.tags.push('RESOLUCAO_INSUFICIENTE');
        addIndexSet(indexBag, signal, [
          { key: 'indice_satisfacao', score: scoreByAnswer(answer, { sim: 85, parcial: 55, nao: 15 }), weight: 2 },
          { key: 'indice_recuperabilidade', score: scoreByAnswer(answer, { sim: 90, parcial: 55, nao: 10 }), weight: 2 }
        ]);
        break;
      case '6a5b7cf5-ab10-4a38-9378-a96de24dc778':
        if (sanitizeText(answer)) {
          signal.tags.push('PENDENCIA_ABERTA');
          addIndexSet(indexBag, signal, [
            { key: 'indice_gravidade_operacional', score: 75, weight: 1 },
            { key: 'indice_recuperabilidade', score: 40, weight: 1 }
          ]);
        }
        break;
      case '044723ef-3139-479d-80d3-a76e91b09b9d':
        if (normalizedAnswer === 'otimo') signal.tags.push('SOLUCAO_BEM_AVALIADA');
        if (normalizedAnswer === 'ok') signal.tags.push('SOLUCAO_OK');
        if (normalizedAnswer === 'precisa melhorar') signal.tags.push('SOLUCAO_MAL_AVALIADA');
        addIndexSet(indexBag, signal, [{ key: 'indice_satisfacao', score: scoreByAnswer(answer, { otimo: 90, ok: 55, 'precisa melhorar': 20 }), weight: 2 }]);
        break;
      case '42205d3b-cdcc-40f6-9ab7-5309efe2eb67':
        if (normalizedAnswer === 'excelente') signal.tags.push('RESOLUCAO_EXCELENTE');
        if (normalizedAnswer === 'bom') signal.tags.push('RESOLUCAO_BOA');
        if (normalizedAnswer === 'razoavel') signal.tags.push('RESOLUCAO_RAZOAVEL');
        if (normalizedAnswer === 'ruim') signal.tags.push('RESOLUCAO_RUIM');
        addIndexSet(indexBag, signal, [{ key: 'indice_satisfacao', score: scoreByAnswer(answer, { excelente: 95, bom: 80, razoavel: 55, ruim: 15 }), weight: 3 }]);
        break;
      case 'c88726e2-c32e-4d1c-9c00-0f7893d31560': {
        const interest = classifyInterestLine(answer);
        signal.tags.push('CHAMADO_TECNICO', 'LINHA_EQUIPAMENTO_IDENTIFICADA', ...interest.tags);
        signal.keywords.push(...interest.keywords);
        addIndexSet(indexBag, signal, [{ key: 'indice_gravidade_operacional', score: 65, weight: 1 }]);
        break;
      }
      case 'eedc608d-371c-4119-a0e4-074234f1a65a':
        if (normalizedAnswer.includes('alta')) signal.tags.push('CASO_TECNICO_URGENTE');
        if (normalizedAnswer.includes('media')) signal.tags.push('CASO_TECNICO_MEDIO');
        if (normalizedAnswer.includes('baixa')) signal.tags.push('CASO_TECNICO_BAIXO');
        addIndexSet(indexBag, signal, [{
          key: 'indice_gravidade_operacional',
          score: scoreByAnswer(answer, {
            'alta (parado)': 95,
            'media (falha parcial)': 65,
            'baixa (duvida/estetico)': 30
          }),
          weight: 2
        }]);
        break;
      case '40e8b424-a8d9-41b2-a83f-379430e9c41a':
        if (normalizedAnswer === 'sim') signal.tags.push('VISITA_AGENDADA');
        if (normalizedAnswer === 'nao') signal.tags.push('VISITA_NAO_AGENDADA');
        if (normalizedAnswer === 'aguardando confirmacao do tecnico') signal.tags.push('AGUARDANDO_CONFIRMACAO_TECNICO');
        addIndexSet(indexBag, signal, [{ key: 'indice_gravidade_operacional', score: scoreByAnswer(answer, { sim: 40, nao: 80, 'aguardando confirmacao do tecnico': 65 }), weight: 1 }]);
        break;
      case 'beafca5a-fea6-419e-b074-3df0832219b6': {
        const technical = classifyTechnicalDefect(answer);
        signal.interpretedValue = technical.interpretedValue;
        signal.tags.push(...technical.tags);
        signal.keywords.push(...technical.keywords);
        addIndexSet(indexBag, signal, [{ key: 'indice_gravidade_operacional', score: technical.score, weight: 1 }]);
        break;
      }
      case 'bd733ba7-1ff3-42ba-8622-99da94ec01c2': {
        const reason = classifyReactivationReason(answer);
        signal.interpretedValue = reason.interpretedValue;
        signal.tags.push(...reason.tags);
        signal.keywords.push(...reason.keywords);
        addIndexSet(indexBag, signal, [
          { key: 'indice_retencao', score: reason.score, weight: 2 },
          { key: 'indice_risco_perda', score: 100 - reason.score, weight: 2 }
        ]);
        break;
      }
      case '51642588-d2c1-48f1-a569-301c5020f354': {
        const condition = classifyReactivationCondition(answer);
        signal.interpretedValue = condition.interpretedValue;
        signal.tags.push(...condition.tags);
        signal.keywords.push(...condition.keywords);
        addIndexSet(indexBag, signal, [
          { key: 'indice_retencao', score: condition.score, weight: 1 },
          { key: 'indice_recuperabilidade', score: condition.score, weight: 2 }
        ]);
        break;
      }
      case '5431ade9-543a-4c7d-8b33-596d4b243fd9': {
        const timing = classifyCommercialTiming(answer, 'reativacao');
        signal.interpretedValue = timing.interpretedValue;
        signal.tags.push(...timing.tags);
        addIndexSet(indexBag, signal, [
          { key: 'indice_retencao', score: timing.score, weight: 1 },
          { key: 'indice_interesse_comercial', score: timing.score, weight: 1 }
        ]);
        break;
      }
      case '7a6a106f-5079-42af-8d4f-d7a136c82999':
        if (normalizedAnswer === 'sim') signal.tags.push('CLIENTE_REATIVAVEL');
        if (normalizedAnswer === 'nao') signal.tags.push('REATIVACAO_NEGADA');
        addIndexSet(indexBag, signal, [
          { key: 'indice_retencao', score: scoreByAnswer(answer, { sim: 90, nao: 10 }), weight: 3 },
          { key: 'indice_interesse_comercial', score: scoreByAnswer(answer, { sim: 85, nao: 20 }), weight: 2 }
        ]);
        break;
      case 'f7656f06-1421-4384-991a-02aabb409dc4': {
        const interest = classifyInterestLine(answer);
        if (interest.line) {
          const label = lineToLabel(interest.line);
          if (label) {
            signal.capturedData.interest_product = label;
            capturedData.interestProduct = capturedData.interestProduct || label;
          }
        }
        signal.tags.push(...interest.tags);
        addIndexSet(indexBag, signal, [
          { key: 'indice_oportunidade_upsell', score: interest.line ? 90 : 20, weight: 3 },
          { key: 'indice_interesse_comercial', score: interest.line ? 80 : 25, weight: 2 }
        ]);
        break;
      }
      default:
        break;
    }

    signal.tags.forEach(tag => pushTag(tags, tag));
    signals.push(signal);
  }

  if (capturedData.email) pushTag(tags, 'CADASTRO_COM_EMAIL');
  if (capturedData.buyerName) pushTag(tags, 'CADASTRO_COM_DECISOR');
  if (capturedData.responsiblePhone) pushTag(tags, 'CADASTRO_COM_WHATSAPP');

  if (capturedData.email && capturedData.buyerName && capturedData.responsiblePhone) {
    pushTag(tags, 'CADASTRO_RICO');
  } else {
    pushTag(tags, 'CADASTRO_INCOMPLETO');
  }

  const indices = Object.fromEntries(
    INDEX_KEYS.map(key => {
      const bucket = indexBag[key];
      const value = bucket.weight > 0 ? Math.round(bucket.total / bucket.weight) : 50;
      return [key, Math.max(0, Math.min(100, value))];
    })
  ) as Record<QuestionnaireIndexKey, number>;

  if (indices.indice_satisfacao >= 75) {
    pushTag(tags, 'SATISFACAO_ALTA');
    pushTag(tags, 'RELACIONAMENTO_POSITIVO');
  } else if (indices.indice_satisfacao <= 35) {
    pushTag(tags, 'SATISFACAO_BAIXA');
  } else if (indices.indice_satisfacao !== 50) {
    pushTag(tags, 'SATISFACAO_NEUTRA');
    pushTag(tags, 'NECESSITA_ACOMPANHAMENTO');
  }

  if (indices.indice_risco_perda >= 70) {
    pushTag(tags, 'RISCO_DE_PERDA');
    pushTag(tags, 'RETENCAO_BAIXA');
  }

  if (indices.indice_interesse_comercial >= 70 || indices.indice_oportunidade_upsell >= 70 || capturedData.interestProduct) {
    pushTag(tags, 'OPORTUNIDADE_COMERCIAL');
    pushTag(tags, 'INTERESSE_SEGMENTADO');
    pushTag(tags, 'OPORTUNIDADE_UPSELL');
  }

  if (indices.indice_recuperabilidade >= 70 || indices.indice_retencao >= 70 || tags.has('CLIENTE_REATIVAVEL')) {
    pushTag(tags, 'CLIENTE_RECUPERAVEL');
  }

  if (
    tags.has('PREJUIZO_DECLARADO') ||
    tags.has('SOLICITA_REEMBOLSO') ||
    tags.has('NECESSITA_RETRABALHO') ||
    indices.indice_gravidade_operacional >= 80
  ) {
    pushTag(tags, 'RECLAMACAO_GRAVE');
  }

  if (!capturedData.interestProduct) {
    const derivedInterestTag = Array.from(tags).find(tag => tag.startsWith('INTERESSE_'));
    if (derivedInterestTag) {
      capturedData.interestProduct = derivedInterestTag
        .replace('INTERESSE_', '')
        .replace('LINHA_BANHO', 'LINHA BANHO')
        .replace('LINHA_PISCINA', 'LINHA PISCINA');
    }
  }

  const profile = classifyClientProfile(tags, indices, capturedData);

  if (profile.comercialPerfil === 'LEAD_MORNO') pushTag(tags, 'LEAD_MORNO');
  if (profile.comercialPerfil === 'LEAD_FRIO') pushTag(tags, 'LEAD_FRIO');
  if (profile.comercialPerfil === 'CLIENTE_EXPLORAVEL_COMERCIALMENTE') pushTag(tags, 'OPORTUNIDADE_COMERCIAL');
  if (profile.cadastroPerfil === 'CADASTRO_RICO') pushTag(tags, 'CADASTRO_RICO');
  if (profile.cadastroPerfil === 'CADASTRO_POBRE') pushTag(tags, 'CADASTRO_INCOMPLETO');
  if (profile.retencaoPerfil === 'CLIENTE_EM_RISCO_DE_PERDA') pushTag(tags, 'RISCO_DE_PERDA');
  if (profile.retencaoPerfil === 'CLIENTE_RECUPERAVEL') pushTag(tags, 'CLIENTE_RECUPERAVEL');

  return {
    tags: Array.from(tags),
    indices,
    profile,
    questionSignals: signals,
    feeds: Array.from(feeds),
    capturedData
  };
};

export const buildQuestionnaireClientContext = (
  client?: Partial<Client> | QuestionnaireBusinessClientContext | null
) => {
  if (!client) return {};

  if ('buyer_name' in client || 'responsible_phone' in client) {
    return buildClientContextFromClient(client as Partial<Client>);
  }

  return client as QuestionnaireBusinessClientContext;
};

export const isBusinessRiskTag = (tag?: string) =>
  Boolean(tag) && NEGATIVE_RETENTION_TAGS.has(String(tag));
