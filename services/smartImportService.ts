import { Client } from '../types';
import * as xlsx from 'xlsx';

// Synonyms dictionary for column mapping
const columnSynonyms: Record<string, string[]> = {
  name: ['nome', 'cliente', 'razao social', 'razao_social', 'name', 'contato'],
  phone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone', 'contato 1'],
  phone_secondary: ['telefone 2', 'celular 2', 'tel 2', 'contato 2'],
  email: ['e-mail', 'email', 'correio eletronico'],
  street: ['endereco', 'endereço', 'rua', 'logradouro', 'avenida', 'street'],
  neighborhood: ['bairro', 'setor', 'neighborhood'],
  city: ['cidade', 'municipio', 'city'],
  state: ['estado', 'uf', 'state'],
  zip_code: ['cep', 'codigo postal', 'zip']
};

export const SmartImportService = {
  detectColumnMapping: (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const lowerHeaders = headers.map(h => (h || '').toString().toLowerCase().trim());
    const matchedIndices = new Set<number>();

    // 1. Exact matches first (highest priority)
    for (const [standardKey, synonyms] of Object.entries(columnSynonyms)) {
      const matchIndex = lowerHeaders.findIndex((header, idx) => 
        !matchedIndices.has(idx) && synonyms.some(synonym => header === synonym)
      );
      if (matchIndex !== -1) {
        mapping[standardKey] = headers[matchIndex];
        matchedIndices.add(matchIndex);
      }
    }

    // 2. Partial matches (with exclusions)
    const streetKeywords = columnSynonyms['street'];
    for (const [standardKey, synonyms] of Object.entries(columnSynonyms)) {
      if (mapping[standardKey]) continue; // Already matched exactly

      const matchIndex = lowerHeaders.findIndex((header, idx) => {
        if (matchedIndices.has(idx)) return false;
        
        const hasSynonym = synonyms.some(synonym => header.includes(synonym));
        
        // CRITICAL BUG FIX: If we are looking for 'name', but the header contains street keywords, IGNORE IT.
        if (standardKey === 'name') {
          const isStreet = streetKeywords.some(sk => header.includes(sk));
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
    if (!phoneRaw) return '';
    const cleaned = String(phoneRaw).replace(/\D/g, '');
    return cleaned; 
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
        const mappedData: Partial<Client> = {
          name: SmartImportService.normalizeName(row[mapping['name']]),
          phone: SmartImportService.normalizePhone(row[mapping['phone']]),
          email: row[mapping['email']] || '',
          street: row[mapping['street']] || '',
          neighborhood: row[mapping['neighborhood']] || '',
          city: row[mapping['city']] || '',
          state: row[mapping['state']] || '',
          zip_code: row[mapping['zip_code']] || '',
          phone_secondary: SmartImportService.normalizePhone(row[mapping['phone_secondary']]),
          status: 'CLIENT',
          origin: 'CSV_IMPORT'
        };

        if (!mappedData.phone) continue; // Require phone

        const existingClient = existingClients.find(c => 
          c.phone === mappedData.phone || 
          (c.phone_secondary && c.phone_secondary === mappedData.phone) ||
          (mappedData.phone_secondary && c.phone === mappedData.phone_secondary)
        );

        if (existingClient) {
          // Merge logic: prefer existing data, fill in gaps
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
