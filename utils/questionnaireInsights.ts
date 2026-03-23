import { CallType, Question } from '../types';

const normalizeText = (value: string = '') =>
  value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const GENERIC_VALUES = new Set([
  'sim',
  'outro',
  'outros',
  'yes'
]);

const normalizeCallTypeValue = (value?: string | null) =>
  String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const EMAIL_KEYS = ['email_cliente', 'email', 'email_comprador', 'buyer_email'];
const INTEREST_KEYS = ['interest_product', 'upsell_interesse_produto', 'interesse_produto', 'produto_interesse'];
const BUYER_KEYS = ['buyer_name', 'nome_comprador', 'comprador_nome', 'nome_do_comprador', 'nome_decisor', 'decisor_nome'];
const PHONE_KEYS = ['responsible_phone', 'telefone_comprador', 'telefone_decisor', 'telefone_responsavel', 'comprador_telefone'];
const OFFER_INTEREST_KEYS = ['offer_interest_level', 'nivel_interesse_oferta', 'interesse_inicial_prospect', 'receptividade_oferta'];
const OFFER_BLOCKER_KEYS = ['offer_blocker_reason', 'objecao_principal', 'objeção_principal', 'principal_impedimento', 'motivo_nao_compra'];
const PORTFOLIO_SCOPE_KEYS = ['portfolio_scope', 'escopo_linha', 'abrangencia_linhas'];

const questionHints: Record<string, string[]> = {
  email_cliente: ['email', 'e mail'],
  interest_product: ['interesse', 'produto', 'servico', 'linha', 'explorado para compra', 'demonstrou interesse'],
  buyer_name: ['comprador', 'decisor', 'responsavel pela compra'],
  responsible_phone: ['telefone do comprador', 'telefone do decisor', 'telefone responsavel', 'telefone para contato do comprador'],
  motivo_insatisfacao_principal: ['principal ponto de insatisfacao'],
  satisfacao_resolucao: ['satisfacao com a resolucao', 'avaliacao da solucao apresentada'],
  prazo_dias_atraso: ['quantos dias de atraso'],
  produto_problema_especifico: ['problema especifico com o produto', 'qual equipamento apresentou falha', 'resumo tecnico do defeito'],
  offer_interest_level: ['interesse inicial do prospect', 'nivel de interesse', 'receptividade da oferta'],
  offer_blocker_reason: ['objecao principal identificada', 'objeção principal identificada', 'principal impedimento', 'motivo para nao comprar'],
  portfolio_scope: ['todas as linhas', 'somente a linha da ligacao', 'refere se a todas as linhas']
};

const allAliasGroups: Record<string, string[]> = {
  email_cliente: EMAIL_KEYS,
  interest_product: INTEREST_KEYS,
  buyer_name: BUYER_KEYS,
  responsible_phone: PHONE_KEYS,
  offer_interest_level: OFFER_INTEREST_KEYS,
  offer_blocker_reason: OFFER_BLOCKER_KEYS,
  portfolio_scope: PORTFOLIO_SCOPE_KEYS
};

type LegacyQuestionGroup = {
  label: string;
  type?: CallType | 'ALL' | string;
  canonicalQuestionIds: string[];
  canonicalFields?: string[];
  legacyIds: string[];
};

const LEGACY_QUESTION_GROUPS: LegacyQuestionGroup[] = [
  {
    label: 'Atendimento durante a compra',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['47f86d94-ca65-47db-907c-42502023283d'],
    canonicalFields: ['insatisfacao_atendimento'],
    legacyIds: ['690e6bd4-9128-4dd1-af9e-353a432b8973']
  },
  {
    label: 'Entrega/execucao conforme combinado',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['b58f3257-c0c9-43b8-9e63-b0304b6072db'],
    canonicalFields: ['atraso_entrega'],
    legacyIds: ['bfecbb52-2bb5-4072-957f-f3abc5f0bb91']
  },
  {
    label: 'Equipamento atendeu expectativas',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['e2870432-334d-4e49-b7c0-3c369ea8ff54'],
    canonicalFields: ['q_produto_estoque'],
    legacyIds: ['5e4f032f-42b4-467a-a587-31a529718685']
  },
  {
    label: 'Dificuldade de uso/manutencao',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['08011904-21ff-4206-9aa9-be9e8f95cda2'],
    canonicalFields: ['dificuldade_uso'],
    legacyIds: ['d17491da-04b6-4410-9b8a-500f2e91f64e']
  },
  {
    label: 'Recomendaria a empresa',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['4fb97f9f-e19e-4748-b703-938ad5da1259'],
    canonicalFields: ['q_nps'],
    legacyIds: ['7db14ea4-07da-4b07-9cbb-ae569fedd080']
  },
  {
    label: 'Seguranca no dimensionamento/indicacao',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['8c1901f1-9dc7-478f-8c4b-4b526fb7cfa4'],
    canonicalFields: ['seguranca_dimensionamento'],
    legacyIds: ['c79ad319-baae-4e37-815b-09c3b647ee62']
  },
  {
    label: 'O cliente pode ser explorado para compra?',
    type: 'ALL',
    canonicalQuestionIds: ['f7656f06-1421-4384-991a-02aabb409dc4'],
    legacyIds: ['273b50e1-2ce6-4ca0-a638-7e6cdd284fb3']
  },
  {
    label: 'Principal ponto de insatisfacao',
    type: CallType.POS_VENDA,
    canonicalQuestionIds: ['fd580427-df50-40e4-b48a-3ea484a36137'],
    canonicalFields: ['motivo_perda'],
    legacyIds: ['f389c360-97b2-44f6-92c1-151fb463f8f8']
  }
];

const isMeaningful = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const resolveResponseValueByKey = (
  responses: Record<string, any>,
  key?: string
) => {
  if (!key) return undefined;

  const raw = responses[key];
  const note = responses[`${key}_note`];

  if (typeof raw === 'string') {
    const normalized = normalizeText(raw);
    if (GENERIC_VALUES.has(normalized) && isMeaningful(note)) {
      return typeof note === 'string' ? note.trim() : note;
    }
    if (raw.trim()) return raw.trim();
  }

  if (isMeaningful(raw)) return raw;
  if (isMeaningful(note)) return typeof note === 'string' ? note.trim() : note;
  return undefined;
};

const sanitizePhone = (value?: string) => {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits : value.trim();
};

const sanitizeEmail = (value?: string) => {
  if (!value) return undefined;
  return value.trim().toLowerCase();
};

const sanitizeInterest = (value?: string) => {
  if (!value) return undefined;
  const cleaned = value.trim();
  const normalized = normalizeText(cleaned);
  if (!normalized || normalized === 'nao' || normalized === 'nenhum') return undefined;
  return cleaned;
};

const pickResponseValue = (responses: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = resolveResponseValueByKey(responses, key);
    if (value !== undefined) return value;
  }

  return undefined;
};

const inferCanonicalFieldFromQuestion = (question: Question) => {
  const field = question.campo_resposta;
  if (field && allAliasGroups[field]) return field;

  const normalizedText = normalizeText(question.text);
  for (const [canonicalField, hints] of Object.entries(questionHints)) {
    if (hints.some(hint => normalizedText.includes(hint))) {
      return canonicalField;
    }
  }

  return null;
};

const legacyQuestionMatchesContext = (
  group: LegacyQuestionGroup,
  callType?: CallType | 'ALL' | string
) => {
  if (!group.type || group.type === 'ALL' || !callType) return true;
  return normalizeCallTypeValue(String(group.type)) === normalizeCallTypeValue(String(callType));
};

const findLegacyQuestionGroupByKey = (key?: string) => {
  if (!key) return undefined;
  return LEGACY_QUESTION_GROUPS.find(group =>
    group.legacyIds.includes(key) ||
    group.canonicalQuestionIds.includes(key) ||
    (group.canonicalFields || []).includes(key)
  );
};

const findLegacyQuestionGroupByQuestion = (question: Question) =>
  LEGACY_QUESTION_GROUPS.find(group =>
    group.canonicalQuestionIds.includes(question.id) ||
    (!!question.campo_resposta && (group.canonicalFields || []).includes(question.campo_resposta))
  );

const applyLegacyQuestionAliases = (
  responses: Record<string, any>,
  callType?: CallType | 'ALL' | string
) => {
  const enriched = { ...responses };

  for (const group of LEGACY_QUESTION_GROUPS) {
    if (!legacyQuestionMatchesContext(group, callType)) continue;

    const legacyValue = group.legacyIds
      .map(key => resolveResponseValueByKey(enriched, key))
      .find(value => value !== undefined);

    if (legacyValue === undefined) continue;

    group.canonicalQuestionIds.forEach(questionId => {
      if (!isMeaningful(enriched[questionId])) {
        enriched[questionId] = legacyValue;
      }
    });

    (group.canonicalFields || []).forEach(field => {
      if (!isMeaningful(enriched[field])) {
        enriched[field] = legacyValue;
      }
    });
  }

  return enriched;
};

export const resolveQuestionLabel = (
  key: string,
  questions: Question[] = []
) => {
  const directQuestion = questions.find(question => question.id === key || question.campo_resposta === key);
  if (directQuestion) return directQuestion.text;

  const legacyGroup = findLegacyQuestionGroupByKey(key);
  if (legacyGroup) {
    const canonicalQuestion = questions.find(question =>
      legacyGroup.canonicalQuestionIds.includes(question.id) ||
      (!!question.campo_resposta && (legacyGroup.canonicalFields || []).includes(question.campo_resposta))
    );
    return canonicalQuestion?.text || legacyGroup.label;
  }

  return key;
};

export const questionMatchesContext = (
  question: Question,
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const normalizedQuestionType = normalizeCallTypeValue(String(question.type || 'ALL'));
  const normalizedCallType = normalizeCallTypeValue(String(callType || 'ALL'));
  const matchesType =
    !callType ||
    normalizedQuestionType === 'ALL' ||
    normalizedCallType === 'ALL' ||
    normalizedQuestionType === normalizedCallType;
  if (!matchesType) return false;

  if (question.proposito) {
    return question.proposito === proposito;
  }

  return true;
};

const getApplicableQuestions = (
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) =>
  questions
    .filter(question => questionMatchesContext(question, callType, proposito))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

const questionSupportsFreeText = (question: Question) => {
  const options = Array.isArray(question.options) ? question.options : [];
  if (question.tipo_input === 'text') return true;
  if (options.some(option => option === '__TEXT__' || option === '__TEXTAREA__')) return true;
  return options.filter(option => !option.startsWith('__')).length === 0;
};

const getLegacyQuestionKeys = (question: Question) => {
  if (!question.order) return [];

  const normalizedType = normalizeCallTypeValue(String(question.type || ''));
  const prefixesByType: Record<string, string[]> = {
    POS_VENDA: ['pv'],
    PROSPECCAO: ['pr'],
    REATIVACAO: ['re'],
    VENDA: ['v'],
    CONFIRMACAO_PROTOCOLO: ['cp']
  };

  return (prefixesByType[normalizedType] || []).flatMap(prefix => [
    `${prefix}${question.order}`,
    `${prefix}${question.order} `
  ]);
};

export const resolveStoredResponseForQuestion = (
  responses: Record<string, any> | undefined,
  question: Question
) => {
  if (!responses) return undefined;

  const directFieldValue = resolveResponseValueByKey(responses, question.campo_resposta);
  if (directFieldValue !== undefined) {
    return directFieldValue;
  }

  const directIdValue = resolveResponseValueByKey(responses, question.id);
  if (directIdValue !== undefined) {
    return directIdValue;
  }

  const questionTextNorm = normalizeText(question.text);
  for (const key of Object.keys(responses)) {
    if (normalizeText(key) === questionTextNorm) {
      const questionTextValue = resolveResponseValueByKey(responses, key);
      if (questionTextValue !== undefined) {
        return questionTextValue;
      }
    }
  }

  for (const legacyKey of getLegacyQuestionKeys(question)) {
    const legacyValue = resolveResponseValueByKey(responses, legacyKey);
    if (legacyValue !== undefined) {
      return legacyValue;
    }
  }

  const legacyGroup = findLegacyQuestionGroupByQuestion(question);
  if (legacyGroup) {
    for (const legacyId of legacyGroup.legacyIds) {
      const legacyValue = resolveResponseValueByKey(responses, legacyId);
      if (legacyValue !== undefined) {
        return legacyValue;
      }
    }
  }

  return undefined;
};

export interface ResolvedQuestionnaireEntry {
  key: string;
  label: string;
  value: unknown;
  questionId?: string;
  campoResposta?: string;
}

export const resolveQuestionnaireEntries = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
): ResolvedQuestionnaireEntry[] => {
  const entries = getApplicableQuestions(questions, callType, proposito)
    .map(question => {
      const value = resolveStoredResponseForQuestion(responses, question);
      if (!isMeaningful(value)) return null;

      return {
        key: question.campo_resposta || question.id,
        label: question.text,
        value,
        questionId: question.id,
        campoResposta: question.campo_resposta
      } satisfies ResolvedQuestionnaireEntry;
    })
    .filter(Boolean) as ResolvedQuestionnaireEntry[];

  if (entries.length > 0) {
    return entries;
  }

  return Object.entries(responses || {})
    .filter(([key, value]) => !key.endsWith('_note') && isMeaningful(value))
    .map(([key, value]) => ({
      key,
      label: resolveQuestionLabel(key, questions),
      value
    }));
};

export const buildQuestionnaireTextSummary = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const lines = getApplicableQuestions(questions, callType, proposito)
    .filter(questionSupportsFreeText)
    .map(question => {
      const value = resolveStoredResponseForQuestion(responses, question);
      if (!isMeaningful(value)) return null;
      return `${question.text}: ${String(value).trim()}`;
    })
    .filter(Boolean) as string[];

  return lines.join('\n');
};

export const enrichQuestionnaireResponses = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const enriched = applyLegacyQuestionAliases({ ...responses }, callType);

  for (const [canonicalField, aliases] of Object.entries(allAliasGroups)) {
    const directValue = pickResponseValue(enriched, aliases);
    if (isMeaningful(directValue)) {
      enriched[canonicalField] = directValue;
    }
  }

  for (const question of getApplicableQuestions(questions, callType, proposito)) {
    const rawValue = resolveStoredResponseForQuestion(enriched, question);
    if (!isMeaningful(rawValue)) continue;

    const canonicalField = inferCanonicalFieldFromQuestion(question);
    if (canonicalField && !isMeaningful(enriched[canonicalField])) {
      enriched[canonicalField] = rawValue;
    }

    if (question.id && !isMeaningful(enriched[question.id])) {
      enriched[question.id] = rawValue;
    }

    if (question.campo_resposta && !isMeaningful(enriched[question.campo_resposta])) {
      enriched[question.campo_resposta] = rawValue;
    }
  }

  if (isMeaningful(enriched.email)) enriched.email_cliente = enriched.email;
  if (isMeaningful(enriched.email_cliente)) enriched.email = enriched.email_cliente;

  if (isMeaningful(enriched.interesse_outro_produto) && !isMeaningful(enriched.interest_product)) {
    enriched.interest_product = enriched.interesse_outro_produto;
  }
  if (isMeaningful(enriched.interest_product) && !isMeaningful(enriched.upsell_interesse_produto)) {
    enriched.upsell_interesse_produto = enriched.interest_product;
  }

  return enriched;
};

const QUESTIONNAIRE_POSITIVE_WORDS = ['excelente', 'otimo', 'bom', 'boa', 'sim', 'satisfeito', 'resolvido', 'adequado', 'atendeu', 'no prazo'];
const QUESTIONNAIRE_NEGATIVE_WORDS = ['ruim', 'pessimo', 'nao', 'insatisfeito', 'defeito', 'atraso', 'problema', 'nao atendeu', 'com problema'];

const getQuestionnaireTextScore = (value: unknown) => {
  const normalized = normalizeText(String(value || ''));
  if (!normalized) return null;

  if (QUESTIONNAIRE_POSITIVE_WORDS.some(word => normalized.includes(normalizeText(word)))) return 85;
  if (QUESTIONNAIRE_NEGATIVE_WORDS.some(word => normalized.includes(normalizeText(word)))) return 25;
  if (normalized === 'regular' || normalized === 'parcial' || normalized === 'talvez' || normalized === 'leve') return 55;

  return null;
};

const getQuestionnaireNumericScore = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = Number(value);
  if (Number.isNaN(raw)) return null;

  const normalizedKey = normalizeText(key);
  if (normalizedKey.includes('nps') || normalizedKey.includes('nota')) {
    if (raw >= 0 && raw <= 10) return raw * 10;
  }

  if (raw >= 1 && raw <= 5) return raw * 20;
  if (raw >= 0 && raw <= 100) return raw;
  return null;
};

export const getQuestionnaireSatisfactionScore = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const enriched = enrichQuestionnaireResponses(responses || {}, questions, callType, proposito);
  const scores: number[] = [];

  for (const [key, value] of Object.entries(enriched)) {
    const normalizedKey = normalizeText(key);
    const isSatisfactionField =
      normalizedKey.includes('satisf') ||
      normalizedKey.includes('avali') ||
      normalizedKey.includes('nps') ||
      normalizedKey.includes('atendimento') ||
      normalizedKey.includes('resolucao') ||
      normalizedKey.includes('prazo') ||
      normalizedKey.includes('entrega') ||
      normalizedKey.includes('produto') ||
      normalizedKey.includes('defeito') ||
      normalizedKey.includes('processo') ||
      normalizedKey.includes('instalacao') ||
      normalizedKey.includes('setor') ||
      normalizedKey.includes('dificuldade') ||
      normalizedKey.includes('seguranca');

    if (!isSatisfactionField) continue;

    const score = getQuestionnaireNumericScore(key, value) ?? getQuestionnaireTextScore(value);
    if (score === null) continue;
    scores.push(score);
  }

  if (scores.length === 0) {
    if (enriched.motivo_perda || enriched.motivo_insatisfacao_principal || enriched.produto_problema_especifico) {
      return 20;
    }
    if (enriched.protocolo_resolvido === 'Sim' || enriched.satisfacao_resolucao === 'Bom' || enriched.satisfacao_resolucao === 'Excelente') {
      return 85;
    }
    return null;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
};

export type QuestionnaireSatisfactionLevel = 'ALTA' | 'MEDIA' | 'BAIXA' | 'SEM_LEITURA';

export const getQuestionnaireSatisfactionLevel = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
): QuestionnaireSatisfactionLevel => {
  const score = getQuestionnaireSatisfactionScore(responses, questions, callType, proposito);
  if (score === null) return 'SEM_LEITURA';
  if (score >= 70) return 'ALTA';
  if (score <= 40) return 'BAIXA';
  return 'MEDIA';
};

export const extractClientInsightsFromResponses = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const enriched = enrichQuestionnaireResponses(responses, questions, callType, proposito);
  const email = sanitizeEmail(pickResponseValue(enriched, EMAIL_KEYS));
  const interestProduct = sanitizeInterest(pickResponseValue(enriched, INTEREST_KEYS));
  const buyerName = pickResponseValue(enriched, BUYER_KEYS)?.toString().trim() || undefined;
  const responsiblePhone = sanitizePhone(pickResponseValue(enriched, PHONE_KEYS)?.toString());

  return {
    enrichedResponses: enriched,
    email,
    interestProduct,
    buyerName,
    responsiblePhone
  };
};

export const extractCampaignInsightsFromResponses = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const enriched = enrichQuestionnaireResponses(responses, questions, callType, proposito);

  return {
    enrichedResponses: enriched,
    offerInterestLevel: pickResponseValue(enriched, OFFER_INTEREST_KEYS)?.toString().trim() || undefined,
    offerBlockerReason: pickResponseValue(enriched, OFFER_BLOCKER_KEYS)?.toString().trim() || undefined,
    portfolioScope: pickResponseValue(enriched, PORTFOLIO_SCOPE_KEYS)?.toString().trim() || undefined
  };
};
