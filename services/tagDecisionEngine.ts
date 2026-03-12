import { CallRecord, ClientTag, TagDecisionResult, TagStatus, TagOrigins, TagCategories, TagMotivos } from '../types';
import { TAG_RULES, TAG_CATEGORIES, TAG_STATUS } from '../constants';

export const TagDecisionEngine = {
  analyzeCall: (record: CallRecord, history?: any[]): TagDecisionResult => {
    const tagsToCreate: Partial<ClientTag>[] = [];
    const logs: string[] = [];

    logs.push(`Analyzing call record ${record.id} for client ${record.clientId}`);

    // Iterar pelas regras de cada categoria
    for (const [categoria, regras] of Object.entries(TAG_RULES)) {
      let categoryScore = 0;
      let matchedMotivo: string | null = null;
      let camposNegativos: string[] = [];
      let isEligible = false;

      logs.push(`Evaluating category: ${categoria}`);

      regras.forEach(regra => {
        const valorResposta = record.responses?.[regra.campo];
        
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
          origem: 'AUTOMATICA' as TagOrigins
        } as any); // Any cast since score_confianca isn't strictly defined in type yet
        logs.push(`  => Tag suggested: ${categoria} (${matchedMotivo}) with score ${categoryScore}`);
      }
    }

    return { tagsToCreate, logs };
  }
};
