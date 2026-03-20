import { CallRecord, Question, User, WhatsAppTask } from '../types';
import { enrichQuestionnaireResponses, extractCampaignInsightsFromResponses } from './questionnaireInsights';

export interface ReportBreakdownItem {
  label: string;
  count: number;
  percentage: number;
}

export interface ReportQuestionBreakdown {
  questionId: string;
  questionText: string;
  type: string;
  purpose?: string;
  totalResponses: number;
  answers: ReportBreakdownItem[];
}

export interface ReportPerformanceInsight {
  key: string;
  label: string;
  totalInteractions: number;
  interestRate: number;
  objectionRate: number;
  satisfactionRate: number;
  averageSatisfactionScore: number;
  topBlockers: ReportBreakdownItem[];
}

export interface ReportAreaInsight {
  key: string;
  label: string;
  averageScore: number;
  totalSignals: number;
}

export interface ManagementReportInsights {
  totalQuestionnaireInteractions: number;
  interestRate: number;
  objectionRate: number;
  satisfactionRate: number;
  averageSatisfactionScore: number;
  blockerBreakdown: ReportBreakdownItem[];
  questionBreakdowns: ReportQuestionBreakdown[];
  productInsights: ReportPerformanceInsight[];
  operatorInsights: ReportPerformanceInsight[];
  processInsights: ReportPerformanceInsight[];
  satisfactionAreas: ReportAreaInsight[];
}

type InteractionLike = {
  id: string;
  responses?: Record<string, any>;
  operatorId?: string;
  assignedTo?: string;
  proposito?: string;
  type?: string;
  campaignName?: string;
  targetProduct?: string;
  offerProduct?: string;
  offerInterestLevel?: string;
  offerBlockerReason?: string;
};

type AggregateBucket = {
  totalInteractions: number;
  interestHits: number;
  objectionHits: number;
  satisfactionPositiveHits: number;
  satisfactionScoreTotal: number;
  satisfactionScoreCount: number;
  blockerCounts: Map<string, number>;
};

const POSITIVE_WORDS = ['excelente', 'otimo', 'ótimo', 'bom', 'boa', 'sim', 'satisfeito', 'resolvido', 'adequado'];
const NEGATIVE_WORDS = ['ruim', 'pessimo', 'péssimo', 'nao', 'não', 'insatisfeito', 'defeito', 'atraso', 'problema'];

const normalizeText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const roundPercentage = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

const toAnswerLabel = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const labels = value.map(item => String(item).trim()).filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : null;
  }

  const text = String(value).trim();
  return text ? text : null;
};

const getQuestionResponseValue = (question: Question, responses: Record<string, any>) => {
  const direct = toAnswerLabel(responses[question.id]);
  if (direct) return direct;
  if (question.campo_resposta) {
    return toAnswerLabel(responses[question.campo_resposta]);
  }
  return null;
};

const getInterestScore = (interaction: InteractionLike, responses: Record<string, any>) => {
  const campaignInsights = extractCampaignInsightsFromResponses(responses);
  const normalizedLevel = normalizeText(
    interaction.offerInterestLevel ||
    responses.offer_interest_level ||
    campaignInsights.offerInterestLevel
  );

  if (normalizedLevel === 'alto') return 100;
  if (normalizedLevel === 'medio' || normalizedLevel === 'médio') return 70;
  if (normalizedLevel === 'baixo') return 35;
  if (normalizedLevel === 'sem_interesse') return 0;

  if (responses.interest_product || responses.upsell_interesse_produto) {
    return 75;
  }

  return null;
};

const getObjectionReason = (interaction: InteractionLike, responses: Record<string, any>) => {
  const campaignInsights = extractCampaignInsightsFromResponses(responses);
  return (
    toAnswerLabel(interaction.offerBlockerReason) ||
    toAnswerLabel(responses.offer_blocker_reason) ||
    toAnswerLabel(campaignInsights.offerBlockerReason) ||
    toAnswerLabel(responses.objecao_principal) ||
    toAnswerLabel(responses.objeção_principal) ||
    toAnswerLabel(responses.principal_impedimento) ||
    toAnswerLabel(responses.motivo_nao_compra)
  );
};

const getTextScore = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  if (POSITIVE_WORDS.some(word => normalized.includes(normalizeText(word)))) return 85;
  if (NEGATIVE_WORDS.some(word => normalized.includes(normalizeText(word)))) return 25;
  if (normalized === 'regular') return 55;

  return null;
};

const getNumericScore = (key: string, value: unknown) => {
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

const getSatisfactionSignals = (responses: Record<string, any>) => {
  const scores: number[] = [];
  const areaScores: Array<{ area: string; score: number }> = [];

  for (const [key, value] of Object.entries(responses)) {
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
      normalizedKey.includes('setor');

    if (!isSatisfactionField) continue;

    const score = getNumericScore(key, value) ?? getTextScore(value);
    if (score === null) continue;

    scores.push(score);

    const area =
      normalizedKey.includes('produto') || normalizedKey.includes('defeito') || normalizedKey.includes('equipamento')
        ? 'produto'
        : normalizedKey.includes('prazo') || normalizedKey.includes('entrega') || normalizedKey.includes('instalacao') || normalizedKey.includes('processo')
          ? 'processo'
          : 'equipe';

    areaScores.push({ area, score });
  }

  if (scores.length === 0) {
    if (responses.motivo_insatisfacao_principal || responses.produto_problema_especifico) {
      scores.push(20);
      areaScores.push({ area: 'produto', score: 20 });
    } else if (responses.protocolo_resolvido === 'Sim' || responses.servico_concluido === 'Sim') {
      scores.push(85);
      areaScores.push({ area: 'processo', score: 85 });
    }
  }

  return {
    averageScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    areaScores
  };
};

const buildBreakdownItems = (counts: Map<string, number>): ReportBreakdownItem[] => {
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: roundPercentage(count, total)
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const toPerformanceInsights = (source: Map<string, AggregateBucket>): ReportPerformanceInsight[] =>
  Array.from(source.entries())
    .map(([label, bucket]) => ({
      key: label,
      label,
      totalInteractions: bucket.totalInteractions,
      interestRate: roundPercentage(bucket.interestHits, bucket.totalInteractions),
      objectionRate: roundPercentage(bucket.objectionHits, bucket.totalInteractions),
      satisfactionRate: roundPercentage(bucket.satisfactionPositiveHits, bucket.satisfactionScoreCount),
      averageSatisfactionScore: bucket.satisfactionScoreCount > 0
        ? Math.round((bucket.satisfactionScoreTotal / bucket.satisfactionScoreCount) * 10) / 10
        : 0,
      topBlockers: buildBreakdownItems(bucket.blockerCounts).slice(0, 3)
    }))
    .sort((a, b) => b.totalInteractions - a.totalInteractions || a.label.localeCompare(b.label));

const getOrCreateBucket = (map: Map<string, AggregateBucket>, label: string) => {
  const current = map.get(label) || {
    totalInteractions: 0,
    interestHits: 0,
    objectionHits: 0,
    satisfactionPositiveHits: 0,
    satisfactionScoreTotal: 0,
    satisfactionScoreCount: 0,
    blockerCounts: new Map<string, number>()
  };

  map.set(label, current);
  return current;
};

export const buildManagementReportInsights = ({
  calls,
  whatsappTasks,
  questions,
  operators
}: {
  calls: CallRecord[];
  whatsappTasks: WhatsAppTask[];
  questions: Question[];
  operators: User[];
}): ManagementReportInsights => {
  const completedWhatsApp = whatsappTasks.filter(task => task.status === 'completed');
  const interactions: InteractionLike[] = [...calls, ...completedWhatsApp];
  const operatorNames = new Map(operators.map(operator => [operator.id, operator.name]));

  const questionCounts = new Map<string, Map<string, number>>();
  const productBuckets = new Map<string, AggregateBucket>();
  const operatorBuckets = new Map<string, AggregateBucket>();
  const processBuckets = new Map<string, AggregateBucket>();
  const blockerCounts = new Map<string, number>();
  const areaTotals = new Map<string, { total: number; count: number }>();

  let totalQuestionnaireInteractions = 0;
  let totalInterestHits = 0;
  let totalObjectionHits = 0;
  let totalSatisfactionPositiveHits = 0;
  let totalSatisfactionScore = 0;
  let totalSatisfactionScoreCount = 0;

  for (const interaction of interactions) {
    const responses = enrichQuestionnaireResponses(interaction.responses || {}, questions);
    if (Object.keys(responses).length === 0) continue;

    totalQuestionnaireInteractions += 1;

    const interestScore = getInterestScore(interaction, responses);
    const objectionReason = getObjectionReason(interaction, responses);
    const satisfaction = getSatisfactionSignals(responses);

    const productLabel = interaction.offerProduct || interaction.targetProduct || responses.offer_product || responses.target_product || responses.interest_product || 'GERAL';
    const operatorLabel = operatorNames.get(interaction.operatorId || interaction.assignedTo || '') || 'Sem operador';
    const processLabel = interaction.proposito || interaction.type || 'GERAL';

    const buckets = [
      getOrCreateBucket(productBuckets, productLabel),
      getOrCreateBucket(operatorBuckets, operatorLabel),
      getOrCreateBucket(processBuckets, processLabel)
    ];

    buckets.forEach(bucket => {
      bucket.totalInteractions += 1;

      if (interestScore !== null && interestScore >= 60) {
        bucket.interestHits += 1;
      }

      if (objectionReason) {
        bucket.objectionHits += 1;
        bucket.blockerCounts.set(objectionReason, (bucket.blockerCounts.get(objectionReason) || 0) + 1);
      }

      if (satisfaction.averageScore !== null) {
        bucket.satisfactionScoreTotal += satisfaction.averageScore;
        bucket.satisfactionScoreCount += 1;
        if (satisfaction.averageScore >= 70) {
          bucket.satisfactionPositiveHits += 1;
        }
      }
    });

    if (interestScore !== null && interestScore >= 60) totalInterestHits += 1;
    if (objectionReason) {
      totalObjectionHits += 1;
      blockerCounts.set(objectionReason, (blockerCounts.get(objectionReason) || 0) + 1);
    }

    if (satisfaction.averageScore !== null) {
      totalSatisfactionScore += satisfaction.averageScore;
      totalSatisfactionScoreCount += 1;
      if (satisfaction.averageScore >= 70) totalSatisfactionPositiveHits += 1;
    }

    satisfaction.areaScores.forEach(({ area, score }) => {
      const current = areaTotals.get(area) || { total: 0, count: 0 };
      current.total += score;
      current.count += 1;
      areaTotals.set(area, current);
    });

    questions.forEach(question => {
      const answer = getQuestionResponseValue(question, responses);
      if (!answer) return;

      const current = questionCounts.get(question.id) || new Map<string, number>();
      current.set(answer, (current.get(answer) || 0) + 1);
      questionCounts.set(question.id, current);
    });
  }

  const questionBreakdowns = questions
    .map(question => ({
      questionId: question.id,
      questionText: question.text,
      type: question.type,
      purpose: question.proposito,
      totalResponses: Array.from((questionCounts.get(question.id) || new Map()).values()).reduce((sum, value) => sum + value, 0),
      answers: buildBreakdownItems(questionCounts.get(question.id) || new Map())
    }))
    .filter(question => question.totalResponses > 0)
    .sort((a, b) => b.totalResponses - a.totalResponses || a.questionText.localeCompare(b.questionText));

  const satisfactionAreas: ReportAreaInsight[] = Array.from(areaTotals.entries())
    .map(([key, value]) => ({
      key,
      label: key === 'produto' ? 'Produto' : key === 'processo' ? 'Processo / Prazo' : 'Equipe / Atendimento',
      averageScore: value.count > 0 ? Math.round((value.total / value.count) * 10) / 10 : 0,
      totalSignals: value.count
    }))
    .sort((a, b) => b.totalSignals - a.totalSignals || a.label.localeCompare(b.label));

  return {
    totalQuestionnaireInteractions,
    interestRate: roundPercentage(totalInterestHits, totalQuestionnaireInteractions),
    objectionRate: roundPercentage(totalObjectionHits, totalQuestionnaireInteractions),
    satisfactionRate: roundPercentage(totalSatisfactionPositiveHits, totalSatisfactionScoreCount),
    averageSatisfactionScore: totalSatisfactionScoreCount > 0
      ? Math.round((totalSatisfactionScore / totalSatisfactionScoreCount) * 10) / 10
      : 0,
    blockerBreakdown: buildBreakdownItems(blockerCounts).slice(0, 8),
    questionBreakdowns,
    productInsights: toPerformanceInsights(productBuckets),
    operatorInsights: toPerformanceInsights(operatorBuckets),
    processInsights: toPerformanceInsights(processBuckets),
    satisfactionAreas
  };
};
