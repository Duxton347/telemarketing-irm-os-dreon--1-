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

  return undefined;
};

export const enrichQuestionnaireResponses = (
  responses: Record<string, any>,
  questions: Question[] = [],
  callType?: CallType | 'ALL' | string,
  proposito?: string | null
) => {
  const enriched = { ...responses };

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
