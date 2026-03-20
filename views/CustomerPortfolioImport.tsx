import React, { useState } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle2, Link2, Loader2, Upload, Users } from 'lucide-react';
import * as xlsx from 'xlsx';
import { normalizePhone } from '../lib/supabase';
import { dataService } from '../services/dataService';
import { Client, ClientPortfolioEntry } from '../types';
import {
  collectPortfolioMetadata,
  mergePortfolioEntries,
  normalizeComparableText,
  normalizePortfolioValue
} from '../utils/clientPortfolio';

type PreviewStatus = 'READY' | 'NOT_FOUND' | 'INVALID';

interface ParsedPortfolioRow {
  lineNumber: number;
  name: string;
  phone: string;
  normalizedPhone: string;
  profile: string;
  productCategory: string;
  equipment: string;
  status: PreviewStatus;
  reason?: string;
  matchedClient?: Client;
  matchMethod?: 'TELEFONE' | 'TELEFONE + NOME' | 'NOME';
}

interface ImportGroup {
  client: Client;
  entries: ClientPortfolioEntry[];
  sourceRows: ParsedPortfolioRow[];
}

const createEntry = (profile: string, productCategory: string, equipment: string): ClientPortfolioEntry => ({
  profile: normalizePortfolioValue(profile),
  product_category: normalizePortfolioValue(productCategory),
  equipment: normalizePortfolioValue(equipment)
});

const detectColumn = (headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(alias => normalizeComparableText(alias));
  return headers.find(header => {
    const normalizedHeader = normalizeComparableText(header);
    return normalizedAliases.some(alias => normalizedHeader.includes(alias));
  });
};

const getClientMatch = (
  clientByPhone: Map<string, Client[]>,
  clientByName: Map<string, Client[]>,
  rowName: string,
  rowPhone: string
) => {
  const normalizedName = normalizeComparableText(rowName);
  const phoneMatches = clientByPhone.get(rowPhone) || [];

  if (phoneMatches.length === 1) {
    const match = phoneMatches[0];
    const method = normalizedName && normalizeComparableText(match.name) === normalizedName ? 'TELEFONE + NOME' : 'TELEFONE';
    return { client: match, method };
  }

  if (phoneMatches.length > 1 && normalizedName) {
    const phoneAndNameMatch = phoneMatches.find(client => normalizeComparableText(client.name) === normalizedName);
    if (phoneAndNameMatch) {
      return { client: phoneAndNameMatch, method: 'TELEFONE + NOME' as const };
    }
    return { reason: 'Telefone duplicado na base; revise o nome do cliente.' };
  }

  if (normalizedName) {
    const nameMatches = clientByName.get(normalizedName) || [];
    if (nameMatches.length === 1) {
      return { client: nameMatches[0], method: 'NOME' as const };
    }
    if (nameMatches.length > 1) {
      return { reason: 'Nome duplicado na base; telefone não foi suficiente para diferenciar.' };
    }
  }

  return { reason: 'Cliente comprador não encontrado pelo telefone/nome informado.' };
};

export const CustomerPortfolioImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<ParsedPortfolioRow[]>([]);
  const [previewGroups, setPreviewGroups] = useState<ImportGroup[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const readyRows = previewRows.filter(row => row.status === 'READY');
  const invalidRows = previewRows.filter(row => row.status === 'INVALID');
  const notFoundRows = previewRows.filter(row => row.status === 'NOT_FOUND');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);
    setResultMessage(null);
    setPreviewRows([]);
    setPreviewGroups([]);

    try {
      const existingClients = await dataService.getClients();
      const clientByPhone = new Map<string, Client[]>();
      const clientByName = new Map<string, Client[]>();

      for (const client of existingClients) {
        const phones = [client.phone, client.phone_secondary].map(value => normalizePhone(value || '')).filter(Boolean);
        for (const normalized of phones) {
          if (!clientByPhone.has(normalized)) clientByPhone.set(normalized, []);
          clientByPhone.get(normalized)!.push(client);
        }

        const normalizedName = normalizeComparableText(client.name);
        if (normalizedName) {
          if (!clientByName.has(normalizedName)) clientByName.set(normalizedName, []);
          clientByName.get(normalizedName)!.push(client);
        }
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        try {
          const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

          if (rows.length === 0) {
            throw new Error('A planilha está vazia.');
          }

          const headers = Object.keys(rows[0]);
          const nameColumn = detectColumn(headers, ['nome', 'cliente', 'razao social', 'razão social']);
          const phoneColumn = detectColumn(headers, ['telefone', 'fone', 'celular', 'whatsapp', 'contato']);
          const profileColumn = detectColumn(headers, ['perfil', 'segmento', 'tipo cliente', 'tipo']);
          const categoryColumn = detectColumn(headers, ['categoria', 'linha', 'produto', 'categoria produto']);
          const equipmentColumn = detectColumn(headers, ['equipamento', 'modelo', 'produto especifico', 'produto específico', 'item']);

          if (!nameColumn || !phoneColumn) {
            throw new Error('As colunas de Nome e Telefone são obrigatórias para vincular a ficha do cliente.');
          }

          if (!profileColumn && !categoryColumn && !equipmentColumn) {
            throw new Error('A planilha precisa trazer ao menos uma coluna entre Perfil, Categoria ou Equipamento.');
          }

          const parsedRows = rows
            .map((row, index) => {
              const name = String(row[nameColumn] || '').trim();
              const phone = String(row[phoneColumn] || '').trim();
              const normalizedRowPhone = normalizePhone(phone);
              const profile = normalizePortfolioValue(profileColumn ? row[profileColumn] : '');
              const productCategory = normalizePortfolioValue(categoryColumn ? row[categoryColumn] : '');
              const equipment = normalizePortfolioValue(equipmentColumn ? row[equipmentColumn] : '');

              if (!name && !phone && !profile && !productCategory && !equipment) {
                return null;
              }

              if (!normalizedRowPhone) {
                return {
                  lineNumber: index + 2,
                  name,
                  phone,
                  normalizedPhone: normalizedRowPhone,
                  profile,
                  productCategory,
                  equipment,
                  status: 'INVALID' as const,
                  reason: 'Telefone ausente ou inválido.'
                };
              }

              if (!profile && !productCategory && !equipment) {
                return {
                  lineNumber: index + 2,
                  name,
                  phone,
                  normalizedPhone: normalizedRowPhone,
                  profile,
                  productCategory,
                  equipment,
                  status: 'INVALID' as const,
                  reason: 'Linha sem perfil, categoria ou equipamento.'
                };
              }

              const match = getClientMatch(clientByPhone, clientByName, name, normalizedRowPhone);
              if (!match.client) {
                return {
                  lineNumber: index + 2,
                  name,
                  phone,
                  normalizedPhone: normalizedRowPhone,
                  profile,
                  productCategory,
                  equipment,
                  status: 'NOT_FOUND' as const,
                  reason: match.reason
                };
              }

              return {
                lineNumber: index + 2,
                name,
                phone,
                normalizedPhone: normalizedRowPhone,
                profile,
                productCategory,
                equipment,
                status: 'READY' as const,
                matchedClient: match.client,
                matchMethod: match.method
              };
            })
            .filter(Boolean) as ParsedPortfolioRow[];

          const groupsMap = new Map<string, ImportGroup>();

          for (const row of parsedRows.filter(item => item.status === 'READY' && item.matchedClient)) {
            const client = row.matchedClient!;
            const group = groupsMap.get(client.id) || {
              client,
              entries: [],
              sourceRows: []
            };

            group.entries = mergePortfolioEntries(group.entries, [createEntry(row.profile, row.productCategory, row.equipment)]);
            group.sourceRows.push(row);
            groupsMap.set(client.id, group);
          }

          setPreviewRows(parsedRows);
          setPreviewGroups(Array.from(groupsMap.values()).sort((a, b) => a.client.name.localeCompare(b.client.name)));
        } catch (error: any) {
          alert(error.message || 'Erro ao processar a planilha.');
        } finally {
          setLoading(false);
        }
      };

      reader.onerror = () => {
        setLoading(false);
        alert('Não foi possível ler o arquivo.');
      };

      reader.readAsArrayBuffer(uploadedFile);
    } catch (error: any) {
      setLoading(false);
      alert(error.message || 'Erro ao carregar a base atual de clientes.');
    }
  };

  const executeImport = async () => {
    if (previewGroups.length === 0 || importing) return;

    setImporting(true);
    setResultMessage(null);

    try {
      let updatedClients = 0;

      for (const group of previewGroups) {
        const metadata = collectPortfolioMetadata(group.entries);

        await dataService.upsertClient({
          id: group.client.id,
          name: group.client.name,
          phone: group.client.phone,
          portfolio_entries: group.entries,
          customer_profiles: metadata.customer_profiles,
          product_categories: metadata.product_categories,
          equipment_models: metadata.equipment_models,
          items: metadata.equipment_models
        });

        updatedClients += 1;
      }

      setResultMessage(`Importação concluída: ${updatedClients} clientes receberam vínculos técnicos adicionais.`);
    } catch (error: any) {
      alert(error.message || 'Erro ao importar os dados técnicos.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Link2 className="text-blue-600" />
            Perfil e Equipamentos do Cliente
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            Suba um CSV/Excel com `Nome`, `Telefone`, `Perfil`, `Categoria` e `Equipamento` para enriquecer cadastros já compradores.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-black text-slate-800">Como montar a planilha</h2>
            <p className="text-sm text-slate-600">
              Cada linha representa um vínculo técnico do cliente. O mesmo cliente pode aparecer em várias linhas com equipamentos diferentes.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 font-mono text-xs text-slate-600 overflow-auto">
              Nome,Telefone,Perfil,Categoria,Equipamento<br />
              Joao Silva,(11) 99999-0000,Construtor,Boiler,Boiler 500L<br />
              Joao Silva,(11) 99999-0000,Construtor,Fotovoltaico,BZ30<br />
              Hotel Sol,(11) 98888-1111,Hotel,Trocador de Calor,TRX 120
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-black text-slate-800">Regras do vínculo</h2>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>O sistema tenta localizar primeiro pelo telefone, e usa o nome para reforçar ou desempatar.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>As linhas encontradas são agrupadas por cliente antes de salvar, evitando duplicidade de equipamento.</span>
              </div>
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <span>Linhas não encontradas ou ambíguas ficam no preview para revisão antes da importação.</span>
              </div>
            </div>
          </div>
        </div>

        {!file && (
          <div className="border-2 border-dashed border-slate-300 rounded-[24px] p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className="mx-auto h-12 w-12 text-blue-500 mb-3" />
            <p className="font-semibold text-slate-700">Clique ou arraste um arquivo .xlsx/.csv aqui</p>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center text-slate-500 space-y-3">
            <Loader2 className="animate-spin mx-auto text-blue-600" size={32} />
            <p className="font-bold">Processando arquivo e validando vínculos com a base atual...</p>
          </div>
        )}

        {previewRows.length > 0 && !loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                <div className="text-2xl font-black text-slate-800">{previewRows.length}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Linhas válidas lidas</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                <div className="text-2xl font-black text-blue-700">{readyRows.length}</div>
                <div className="text-xs font-semibold text-blue-600 uppercase">Linhas prontas</div>
              </div>
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center">
                <div className="text-2xl font-black text-emerald-700">{previewGroups.length}</div>
                <div className="text-xs font-semibold text-emerald-600 uppercase">Clientes vinculados</div>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-center">
                <div className="text-2xl font-black text-amber-700">{notFoundRows.length}</div>
                <div className="text-xs font-semibold text-amber-600 uppercase">Não encontrados</div>
              </div>
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-center">
                <div className="text-2xl font-black text-rose-700">{invalidRows.length}</div>
                <div className="text-xs font-semibold text-rose-600 uppercase">Inválidas</div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-[24px] p-5 space-y-4">
              <div className="flex items-center gap-2 text-slate-700">
                <Users size={18} className="text-blue-600" />
                <h3 className="font-black uppercase text-sm tracking-widest">Resumo por Cliente</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {previewGroups.map(group => {
                  const metadata = collectPortfolioMetadata(group.entries);
                  return (
                    <div key={group.client.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                      <div>
                        <p className="font-black text-slate-800 uppercase text-sm">{group.client.name}</p>
                        <p className="text-xs font-bold text-slate-500">{group.client.phone}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metadata.customer_profiles.map(profile => (
                          <span key={profile} className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-black uppercase border border-amber-100">{profile}</span>
                        ))}
                        {metadata.product_categories.map(category => (
                          <span key={category} className="px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-[10px] font-black uppercase border border-cyan-100">{category}</span>
                        ))}
                        {metadata.equipment_models.map(model => (
                          <span key={model} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase border border-slate-200">{model}</span>
                        ))}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {group.sourceRows.length} linha(s) da planilha serão adicionadas a este cliente
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto border border-slate-200 rounded-[24px]">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-slate-500 font-black uppercase tracking-widest bg-slate-50 sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Linha</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Cliente da Planilha</th>
                    <th className="px-4 py-3">Vínculo Encontrado</th>
                    <th className="px-4 py-3">Perfil / Categoria / Equipamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {previewRows.map(row => (
                    <tr key={`${row.lineNumber}-${row.normalizedPhone}-${row.equipment}`} className={row.status === 'READY' ? 'bg-white' : row.status === 'NOT_FOUND' ? 'bg-amber-50/40' : 'bg-rose-50/40'}>
                      <td className="px-4 py-3 font-bold text-slate-500">#{row.lineNumber}</td>
                      <td className="px-4 py-3">
                        {row.status === 'READY' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                            <CheckCircle2 size={14} /> Pronta
                          </span>
                        ) : row.status === 'NOT_FOUND' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                            <AlertTriangle size={14} /> Revisar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <AlertTriangle size={14} /> Inválida
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{row.name || 'Sem nome'}</div>
                        <div className="text-xs text-slate-500">{row.phone || 'Sem telefone'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {row.matchedClient ? (
                          <div>
                            <div className="font-bold text-slate-800">{row.matchedClient.name}</div>
                            <div className="text-xs text-slate-500">{row.matchMethod}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 max-w-[260px]">{row.reason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[320px]">
                          {row.profile && <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-black uppercase border border-amber-100">{row.profile}</span>}
                          {row.productCategory && <span className="px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-[10px] font-black uppercase border border-cyan-100">{row.productCategory}</span>}
                          {row.equipment && <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase border border-slate-200">{row.equipment}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resultMessage && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                {resultMessage}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setFile(null);
                  setPreviewRows([]);
                  setPreviewGroups([]);
                  setResultMessage(null);
                }}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={importing}
              >
                Limpar
              </button>
              <button
                onClick={executeImport}
                disabled={previewGroups.length === 0 || importing}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
              >
                {importing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    Vincular aos Cadastros <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
