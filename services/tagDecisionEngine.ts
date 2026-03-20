import { CallRecord, ClientTag, TagDecisionResult, TagStatus, TagOrigins, TagCategories, TagMotivos } from '../types';
import { TAG_RULES, TAG_CATEGORIES, TAG_STATUS } from '../constants';
import { extractClientInsightsFromResponses } from '../utils/questionnaireInsights';

export const TagDecisionEngine = {
  analyzeCall: (record: CallRecord, history?: any[]): TagDecisionResult => {
    const tagsToCreate: Partial<ClientTag>[] = [];
    const logs: string[] = [];
    const insights = extractClientInsightsFromResponses(record.responses || {});
    const resolvedResponses = {
      ...(record.responses || {}),
      ...insights.enrichedResponses
    };

    logs.push(`Analyzing call record ${record.id} for client ${record.clientId}`);

    // Iterar pelas regras de cada categoria
    for (const [categoria, regras] of Object.entries(TAG_RULES)) {
      let categoryScore = 0;
      let matchedMotivo: string | null = null;
      let camposNegativos: string[] = [];
      let isEligible = false;

      logs.push(`Evaluating category: ${categoria}`);

      regras.forEach(regra => {
        const valorResposta = resolvedResponses?.[regra.campo];
        
        if (regra.required && !valorResposta) {
          // Required field not present, skip rule
          return;
        }

        let conditionMet = false;
        if (regra.required && valorResposta) {
            conditionMet = true;
        } else if (regra.equals && valorResposta === regra.equals) {
            conditionMet = true;
        } else if (regra.in && Array.isArray(regra.in) && regra.in.includes(valorResposta)) {
            conditionMet = true;
        }

        if (conditionMet) {
          categoryScore += regra.peso;
          matchedMotivo = regra.motivo;
          isEligible = true;
          logs.push(`  + Rule matched: ${regra.campo} (${regra.motivo}) -> +${regra.peso} points`);
        } else {
          // Ponto negativo / campo que invalidou uma certeza maior
          if (valorResposta) {
            camposNegativos.push(regra.campo);
          }
        }
      });

      // Threshold fixo para considerar a tag como válida (Sugerida)
      // DREON v3: Se uma tag tem peso >= 5, ela é criada.
      if (isEligible && categoryScore >= 5) {
        tagsToCreate.push({
          client_id: record.clientId,
          call_record_id: record.id,
          categoria: categoria as TagCategories,
          motivo: matchedMotivo as TagMotivos,
          label: `${TAG_CATEGORIES[categoria as keyof typeof TAG_CATEGORIES]} - ${matchedMotivo}`,
          status: 'SUGERIDA' as TagStatus,
          origem: 'AUTOMATICA' as TagOrigins,
          score_confianca: categoryScore,
          campos_negativos: camposNegativos
        } as any); // Any cast since score_confianca isn't strictly defined in type yet
        logs.push(`  => Tag suggested: ${categoria} (${matchedMotivo}) with score ${categoryScore}`);
      }
    }

    const dissatisfactionDetail =
      resolvedResponses.motivo_insatisfacao_principal ||
      resolvedResponses.produto_problema_especifico ||
      resolvedResponses.reclamacao_instalacao_ocorrencia ||
      (resolvedResponses.prazo_dias_atraso ? `Atraso de ${resolvedResponses.prazo_dias_atraso} dias` : undefined);

    const dissatisfactionScore =
      (dissatisfactionDetail ? 4 : 0) +
      (resolvedResponses.satisfacao_resolucao === 'Ruim' ? 3 : 0) +
      (resolvedResponses.atraso_entrega === 'Sim' ? 2 : 0) +
      (resolvedResponses.produto_troca_necessaria === 'Sim' ? 3 : 0);

    if (dissatisfactionScore >= 5) {
      const existingRecoveryTag = tagsToCreate.find(tag => tag.categoria === 'RECUPERACAO');
      const detailSuffix = dissatisfactionDetail ? ` (${dissatisfactionDetail})` : '';

      if (existingRecoveryTag) {
        existingRecoveryTag.score_confianca = Math.max(existingRecoveryTag.score_confianca || 0, dissatisfactionScore);
        existingRecoveryTag.motivo_detalhe = dissatisfactionDetail;
        existingRecoveryTag.label = `${TAG_CATEGORIES.RECUPERACAO} - ${existingRecoveryTag.motivo}${detailSuffix}`;
      } else {
        tagsToCreate.push({
          client_id: record.clientId,
          call_record_id: record.id,
          categoria: 'RECUPERACAO' as TagCategories,
          motivo: 'ATENDIMENTO_RUIM' as TagMotivos,
          label: `${TAG_CATEGORIES.RECUPERACAO} - ATENDIMENTO_RUIM${detailSuffix}`,
          status: 'SUGERIDA' as TagStatus,
          origem: 'AUTOMATICA' as TagOrigins,
          score_confianca: dissatisfactionScore,
          motivo_detalhe: dissatisfactionDetail
        });
      }

      logs.push(`  => Dissatisfaction signal captured with score ${dissatisfactionScore}${detailSuffix}`);
    }

    const opportunityDetail = insights.interestProduct;
    const opportunityScore =
      (insights.interestProduct ? 5 : 0) +
      (insights.buyerName ? 2 : 0) +
      (insights.responsiblePhone ? 2 : 0) +
      (insights.email ? 1 : 0);

    if (opportunityScore >= 5) {
      const existingOpportunityTag = tagsToCreate.find(tag => tag.categoria === 'OPORTUNIDADE' && tag.motivo === 'UPSELL');
      const detailSuffix = opportunityDetail ? ` (${opportunityDetail})` : '';

      if (existingOpportunityTag) {
        existingOpportunityTag.score_confianca = Math.max(existingOpportunityTag.score_confianca || 0, opportunityScore);
        existingOpportunityTag.motivo_detalhe = opportunityDetail;
        existingOpportunityTag.label = `${TAG_CATEGORIES.OPORTUNIDADE} - UPSELL${detailSuffix}`;
      } else {
        tagsToCreate.push({
          client_id: record.clientId,
          call_record_id: record.id,
          categoria: 'OPORTUNIDADE' as TagCategories,
          motivo: 'UPSELL' as TagMotivos,
          label: `${TAG_CATEGORIES.OPORTUNIDADE} - UPSELL${detailSuffix}`,
          status: 'SUGERIDA' as TagStatus,
          origem: 'AUTOMATICA' as TagOrigins,
          score_confianca: opportunityScore,
          motivo_detalhe: opportunityDetail,
          campos_negativos: [
            !insights.email ? 'email_cliente' : null,
            !insights.buyerName ? 'buyer_name' : null,
            !insights.responsiblePhone ? 'responsible_phone' : null
          ].filter(Boolean) as string[]
        });
      }

      logs.push(`  => Opportunity signal captured with score ${opportunityScore}${opportunityDetail ? ` (${opportunityDetail})` : ''}`);
    }

    return { tagsToCreate, logs };
  }
};
