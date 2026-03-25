import { Client } from '../types';
import * as xlsx from 'xlsx';
import {
  collectPortfolioMetadata,
  mergePortfolioEntries,
  mergeUniquePortfolioValues,
  normalizeComparableText,
  normalizePortfolioQuantity,
  normalizePortfolioValue
} from '../utils/clientPortfolio';

// Synonyms dictionary for column mapping
const columnSynonyms: Record<string, string[]> = {
  name: ['nome', 'cliente', 'razao social', 'razao_social', 'name', 'contato'],
  phone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone', 'contato 1'],
  phone_secondary: ['telefone 2', 'celular 2', 'tel 2', 'contato 2'],
  email: ['e-mail', 'email', 'correio eletronico'],
  street: ['endereco', 'endereço', 'rua', 'logradouro', 'avenida', 'street'],
  neighborhood: ['bairro', 'neighborhood', 'setor/bairro', 'bairro/setor'],
  city: ['cidade', 'municipio', 'city'],
  state: ['estado', 'uf', 'state'],
  zip_code: ['cep', 'codigo postal', 'zip'],
  customer_profile: ['perfil', 'perfil parceiro', 'perfil de parceiro', 'perfil dos parceiros', 'perfil de parceiros', 'segmento', 'tipo cliente', 'tipo de cliente', 'setor', 'ramo', 'nicho', 'parceiros'],
  product_category: ['categoria', 'categoria produto', 'linha', 'linha produto', 'familia', 'grupo produto'],
  equipment_model: ['equipamento', 'modelo', 'item', 'produto especifico', 'produto especÃ­fico', 'equipamento/modelo'],
  portfolio_quantity: ['quantidade', 'qtd', 'qtde', 'qte']
};

const normalizePhoneDigits = (value: any): string => String(value || '').replace(/\D/g, '');

const splitPortfolioValues = (value: any): string[] => {
  const normalized = normalizePortfolioValue(value);
  if (!normalized) return [];

  return Array.from(new Set(
    normalized
      .split(/[\n;,|]+/g)
      .map(item => normalizePortfolioValue(item))
      .filter(Boolean)
  ));
};

const extractPhones = (phoneRaw: any): { primary: string; secondary: string } => {
  const text = String(phoneRaw || '').trim();
  if (!text) {
    return { primary: '', secondary: '' };
  }

  const explicitMatches = text.match(/\+?\d[\d\s()./-]{7,}\d/g) || [];
  const normalizedExplicit = explicitMatches
    .map(match => normalizePhoneDigits(match))
    .filter(Boolean);

  if (normalizedExplicit.length >= 2) {
    return {
      primary: normalizedExplicit[0],
      secondary: normalizedExplicit[1]
    };
  }

  const cleaned = normalizePhoneDigits(text);
  if (!cleaned) {
    return { primary: '', secondary: '' };
  }

  const local = cleaned.startsWith('55') && cleaned.length >= 12 ? cleaned.slice(2) : cleaned;

  if (local.length === 20 || local.length === 21 || local.length === 22) {
    const primary = local.slice(0, 10) || local.slice(0, 11);
    const remainder = local.slice(primary.length);
    const secondary = remainder.length >= 10 ? remainder : '';
    return {
      primary: cleaned.startsWith('55') ? `55${primary}` : primary,
      secondary: secondary ? (cleaned.startsWith('55') ? `55${secondary}` : secondary) : ''
    };
  }

  if (local.length > 11) {
    return {
      primary: local.slice(0, 11),
      secondary: local.slice(11, 22)
    };
  }

  return { primary: cleaned, secondary: '' };
};

export const SmartImportService = {
  validateRequiredColumns: (mapping: Record<string, string>) => {
    const requiredFields = ['name', 'phone', 'customer_profile'] as const;
    const missingFields = requiredFields.filter(field => !mapping[field]);

    if (missingFields.length === 0) return;

    const labels: Record<(typeof requiredFields)[number], string> = {
      name: 'Nome',
      phone: 'Telefone',
      customer_profile: 'Perfil'
    };

    throw new Error(`Colunas obrigatórias ausentes: ${missingFields.map(field => labels[field]).join(', ')}`);
  },

  detectColumnMapping: (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const normalizedHeaders = headers.map(h => normalizeComparableText((h || '').toString()));
    const matchedIndices = new Set<number>();
    const normalizedStreetKeywords = columnSynonyms['street'].map(keyword => normalizeComparableText(keyword));

    // 1. Exact matches first (highest priority)
    for (const [standardKey, synonyms] of Object.entries(columnSynonyms)) {
      const normalizedSynonyms = synonyms.map(synonym => normalizeComparableText(synonym));
      const matchIndex = normalizedHeaders.findIndex((header, idx) => 
        !matchedIndices.has(idx) && normalizedSynonyms.some(synonym => header === synonym)
      );
      if (matchIndex !== -1) {
        mapping[standardKey] = headers[matchIndex];
        matchedIndices.add(matchIndex);
      }
    }

    // 2. Partial matches (with exclusions)
    for (const [standardKey, synonyms] of Object.entries(columnSynonyms)) {
      if (mapping[standardKey]) continue; // Already matched exactly
      const normalizedSynonyms = synonyms.map(synonym => normalizeComparableText(synonym));

      const matchIndex = normalizedHeaders.findIndex((header, idx) => {
        if (matchedIndices.has(idx)) return false;
        
        const hasSynonym = normalizedSynonyms.some(synonym => header.includes(synonym));
        
        // CRITICAL BUG FIX: If we are looking for 'name', but the header contains street keywords, IGNORE IT.
        if (standardKey === 'name') {
          const isStreet = normalizedStreetKeywords.some(sk => header.includes(sk));
          if (isStreet) return false;
        }

        return hasSynonym;
      });

      if (matchIndex !== -1) {
        mapping[standardKey] = headers[matchIndex];
        matchedIndices.add(matchIndex);
      }
    }

    return mapping;
  },

  normalizePhone: (phoneRaw: any): string => {
    return extractPhones(phoneRaw).primary;
  },

  splitPhones: (primaryRaw: any, secondaryRaw?: any): { phone: string; phone_secondary: string } => {
    const fromPrimary = extractPhones(primaryRaw);
    const fromSecondary = extractPhones(secondaryRaw);

    return {
      phone: fromPrimary.primary || fromSecondary.primary,
      phone_secondary:
        fromSecondary.primary ||
        fromSecondary.secondary ||
        fromPrimary.secondary
    };
  },

  normalizeName: (nameRaw: any): string => {
    if (!nameRaw) return 'Sem Nome';
    // Title Case
    return String(nameRaw)
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  parseExcel: async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  processImport: async (
    rawData: any[], 
    mapping: Record<string, string>, 
    existingClients: Client[]
  ): Promise<{ 
    toInsert: Partial<Client>[], 
    toUpdate: Partial<Client>[], 
    stats: { new: number, updated: number, errors: number } 
  }> => {
    
    const toInsert: Partial<Client>[] = [];
    const toUpdate: Partial<Client>[] = [];
    const stats = { new: 0, updated: 0, errors: 0 };

    for (const row of rawData) {
      try {
        const profileValues = splitPortfolioValues(row[mapping['customer_profile']]);
        const profile = profileValues[0] || normalizePortfolioValue(row[mapping['customer_profile']]);
        const productCategory = normalizePortfolioValue(row[mapping['product_category']]);
        const equipmentModel = normalizePortfolioValue(row[mapping['equipment_model']]);
        const portfolioQuantity = normalizePortfolioQuantity(row[mapping['portfolio_quantity']]);
        const importedPortfolioEntries = mergePortfolioEntries(
          profile || productCategory || equipmentModel
            ? [{
                profile,
                product_category: productCategory,
                equipment: equipmentModel,
                quantity: portfolioQuantity
              }]
            : []
        );
        const importedPortfolioMetadata = collectPortfolioMetadata(importedPortfolioEntries);

        const splitPhones = SmartImportService.splitPhones(
          row[mapping['phone']],
          row[mapping['phone_secondary']]
        );

        const mappedData: Partial<Client> = {
          name: SmartImportService.normalizeName(row[mapping['name']]),
          phone: splitPhones.phone,
          email: row[mapping['email']] || '',
          street: row[mapping['street']] || '',
          neighborhood: row[mapping['neighborhood']] || '',
          city: row[mapping['city']] || '',
          state: row[mapping['state']] || '',
          zip_code: row[mapping['zip_code']] || '',
          phone_secondary: splitPhones.phone_secondary,
          status: 'CLIENT',
          origin: 'CSV_IMPORT',
          customer_profiles: mergeUniquePortfolioValues(profileValues, importedPortfolioMetadata.customer_profiles),
          product_categories: importedPortfolioMetadata.product_categories,
          equipment_models: importedPortfolioMetadata.equipment_models,
          items: importedPortfolioMetadata.equipment_models,
          portfolio_entries: importedPortfolioEntries
        };

        if (!mappedData.phone || !profile) {
          stats.errors++;
          continue;
        }

        const normalizedImportedName = SmartImportService.normalizeName(mappedData.name);
        const existingClient = existingClients.find(c => {
          const samePhone =
            c.phone === mappedData.phone ||
            (c.phone_secondary && c.phone_secondary === mappedData.phone) ||
            (mappedData.phone_secondary && c.phone === mappedData.phone_secondary) ||
            (mappedData.phone_secondary && c.phone_secondary === mappedData.phone_secondary);

          if (samePhone) return true;

          const sameName = SmartImportService.normalizeName(c.name) === normalizedImportedName;
          const phoneCrossMatch = Boolean(
            sameName &&
            mappedData.phone_secondary &&
            (c.phone === mappedData.phone_secondary || c.phone_secondary === mappedData.phone_secondary)
          );

          return phoneCrossMatch;
        });

        if (existingClient) {
          // Merge logic: preserve existing data, fill in gaps, and merge technical profile metadata.
          const updatePayload: Partial<Client> = { id: existingClient.id };
          let changed = false;

          const fieldsToFill: (keyof Client)[] = ['email', 'street', 'neighborhood', 'city', 'state', 'zip_code', 'phone_secondary'];
          
          fieldsToFill.forEach(field => {
            if (!existingClient[field] && mappedData[field]) {
              // @ts-ignore
              updatePayload[field] = mappedData[field];
              changed = true;
            }
          });

          const mergedPortfolioEntries = mergePortfolioEntries(
            existingClient.portfolio_entries || [],
            mappedData.portfolio_entries || []
          );
          const mergedPortfolioMetadata = collectPortfolioMetadata(mergedPortfolioEntries);
          const nextProfiles = mergeUniquePortfolioValues(
            existingClient.customer_profiles || [],
            mappedData.customer_profiles || [],
            mergedPortfolioMetadata.customer_profiles
          );
          const nextCategories = mergedPortfolioMetadata.product_categories;
          const nextEquipment = mergedPortfolioMetadata.equipment_models;

          if (JSON.stringify(mergedPortfolioEntries) !== JSON.stringify(existingClient.portfolio_entries || [])) {
            updatePayload.portfolio_entries = mergedPortfolioEntries;
            changed = true;
          }

          if (JSON.stringify(nextProfiles) !== JSON.stringify(existingClient.customer_profiles || [])) {
            updatePayload.customer_profiles = nextProfiles;
            changed = true;
          }

          if (JSON.stringify(nextCategories) !== JSON.stringify(existingClient.product_categories || [])) {
            updatePayload.product_categories = nextCategories;
            changed = true;
          }

          if (JSON.stringify(nextEquipment) !== JSON.stringify(existingClient.equipment_models || [])) {
            updatePayload.equipment_models = nextEquipment;
            updatePayload.items = nextEquipment;
            changed = true;
          }

          if (changed) {
            toUpdate.push(updatePayload);
            stats.updated++;
          }
        } else {
          // New Client
          toInsert.push(mappedData);
          stats.new++;
        }
      } catch (err) {
        stats.errors++;
      }
    }

    return { toInsert, toUpdate, stats };
  }
};
