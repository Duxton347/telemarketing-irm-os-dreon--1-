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
  normalizePortfolioQuantity,
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
  quantity: number;
  status: PreviewStatus;
  reason?: string;
  matchedClient?: Client;
  matchMethod?: 'TELEFONE' | 'TELEFONE + NOME';
}

interface ImportGroup {
  client: Client;
  entries: ClientPortfolioEntry[];
  sourceRows: ParsedPortfolioRow[];
}

interface ImportExecutionReport {
  updated: string[];
  unchanged: string[];
  errors: Array<{
    clientName: string;
    reason: string;
  }>;
}

const createEntry = (profile: string, productCategory: string, equipment: string, quantity: number): ClientPortfolioEntry => ({
  profile: normalizePortfolioValue(profile),
  product_category: normalizePortfolioValue(productCategory),
  equipment: normalizePortfolioValue(equipment),
  quantity: normalizePortfolioQuantity(quantity)
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

    return { reason: 'Telefone duplicado na base; revise o nome do cliente antes de importar.' };
  }

  if (phoneMatches.length > 1) {
    return { reason: 'Telefone duplicado na base; informe o nome exato do cliente para evitar vinculo incorreto.' };
  }

  if (normalizedName) {
    const nameMatches = clientByName.get(normalizedName) || [];
    if (nameMatches.length >= 1) {
      return { reason: 'O nome existe na base, mas o telefone nao bateu. Para evitar duplicidade, a linha foi bloqueada.' };
    }
  }

  return { reason: 'Cliente comprador nao encontrado pelo telefone informado.' };
};

export const CustomerPortfolioImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('replace');
  const [previewRows, setPreviewRows] = useState<ParsedPortfolioRow[]>([]);
  const [previewGroups, setPreviewGroups] = useState<ImportGroup[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ImportExecutionReport | null>(null);

  const readyRows = previewRows.filter(row => row.status === 'READY');
  const invalidRows = previewRows.filter(row => row.status === 'INVALID');
  const notFoundRows = previewRows.filter(row => row.status === 'NOT_FOUND');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);
    setResultMessage(null);
    setImportReport(null);
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
      reader.onload = loadEvent => {
        try {
          const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

          if (rows.length === 0) {
            throw new Error('A planilha esta vazia.');
          }

          const headers = Object.keys(rows[0]);
          const nameColumn = detectColumn(headers, ['nome', 'cliente', 'razao social', 'razão social']);
          const phoneColumn = detectColumn(headers, ['telefone', 'fone', 'celular', 'whatsapp', 'contato']);
          const profileColumn = detectColumn(headers, ['perfil', 'segmento', 'tipo cliente', 'tipo']);
          const categoryColumn = detectColumn(headers, ['categoria', 'linha', 'produto', 'categoria produto']);
          const equipmentColumn = detectColumn(headers, ['equipamento', 'modelo', 'produto especifico', 'produto específico', 'item']);
          const quantityColumn = detectColumn(headers, ['quantidade', 'qtd', 'qtde', 'qte']);

          if (!nameColumn || !phoneColumn) {
            throw new Error('As colunas de Nome e Telefone sao obrigatorias para vincular a ficha do cliente.');
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
              const quantity = normalizePortfolioQuantity(quantityColumn ? row[quantityColumn] : 1);

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
                  quantity,
                  status: 'INVALID' as const,
                  reason: 'Telefone ausente ou invalido.'
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
                  quantity,
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
                  quantity,
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
                quantity,
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

            group.entries = mergePortfolioEntries(group.entries, [createEntry(row.profile, row.productCategory, row.equipment, row.quantity)]);
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
        alert('Nao foi possivel ler o arquivo.');
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
    setImportReport(null);

    const report: ImportExecutionReport = {
      updated: [],
      unchanged: [],
      errors: []
    };

    for (const group of previewGroups) {
      try {
        const existingEntries = mergePortfolioEntries(group.client.portfolio_entries || []);
        const mergedEntries = importMode === 'replace'
          ? mergePortfolioEntries(group.entries)
          : mergePortfolioEntries(existingEntries, group.entries);

        if (JSON.stringify(mergedEntries) === JSON.stringify(existingEntries)) {
          report.unchanged.push(`${group.client.name} (${group.client.phone || 'sem telefone'})`);
          continue;
        }

        const metadata = collectPortfolioMetadata(mergedEntries);

        await dataService.upsertClient(
          {
            id: group.client.id,
            name: group.client.name,
            phone: group.client.phone,
            portfolio_entries: mergedEntries,
            customer_profiles: metadata.customer_profiles,
            product_categories: metadata.product_categories,
            equipment_models: metadata.equipment_models,
            items: metadata.equipment_models
          },
          { replacePortfolio: importMode === 'replace' }
        );

        report.updated.push(`${group.client.name} (${group.client.phone || 'sem telefone'})`);
      } catch (error: any) {
        report.errors.push({
          clientName: group.client.name,
          reason: error?.message || 'Falha desconhecida ao transferir os dados tecnicos.'
        });
      }
    }

    setImportReport(report);
    setResultMessage(
      `Importacao concluida em modo ${importMode === 'replace' ? 'substituicao' : 'mesclagem'}: ${report.updated.length} cliente(s) atualizados, ${report.unchanged.length} sem novidade e ${report.errors.length} com erro.`
    );
    setImporting(false);
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
            Suba um CSV/Excel com `Nome`, `Telefone`, `Perfil`, `Categoria`, `Equipamento` e `Quantidade` para corrigir ou substituir a carteira tecnica de clientes ja compradores.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-200 space-y-6">
        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Modo da Importacao</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setImportMode('replace')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                importMode === 'replace'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Substituir carteira tecnica
            </button>
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                importMode === 'merge'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Adicionar sem apagar
            </button>
          </div>
          <p className="text-xs font-medium text-slate-500">
            {importMode === 'replace'
              ? 'Substituir apaga o perfil, categorias e equipamentos tecnicos anteriores do cliente e grava exatamente o que veio no arquivo.'
              : 'Adicionar sem apagar apenas complementa o cadastro atual e pode manter perfis ou produtos antigos.'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-black text-slate-800">Como montar a planilha</h2>
            <p className="text-sm text-slate-600">
              Cada linha representa um vinculo tecnico do cliente. O mesmo cliente pode aparecer em varias linhas com equipamentos diferentes.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 font-mono text-xs text-slate-600 overflow-auto">
              Nome,Telefone,Perfil,Categoria,Equipamento,Quantidade<br />
              Joao Silva,(11) 99999-0000,Construtor,Boiler,Boiler 500L,2<br />
              Joao Silva,(11) 99999-0000,Construtor,Fotovoltaico,BZ30,3<br />
              Hotel Sol,(11) 98888-1111,Hotel,Trocador de Calor,TRX 120,1
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-black text-slate-800">Regras do vinculo</h2>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>O sistema so atualiza clientes ja existentes e usa o telefone como chave principal para evitar duplicidade.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>Se o telefone aparecer mais de uma vez na base, o nome exato e usado apenas para desempatar, nunca para criar novo cliente.</span>
              </div>
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <span>Linhas sem telefone valido, sem dados tecnicos ou sem correspondencia segura ficam bloqueadas no preview com o motivo.</span>
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
            <p className="font-bold">Processando arquivo e validando vinculos com a base atual...</p>
          </div>
        )}

        {previewRows.length > 0 && !loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                <div className="text-2xl font-black text-slate-800">{previewRows.length}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Linhas lidas</div>
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
                <div className="text-xs font-semibold text-amber-600 uppercase">Bloqueadas</div>
              </div>
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-center">
                <div className="text-2xl font-black text-rose-700">{invalidRows.length}</div>
                <div className="text-xs font-semibold text-rose-600 uppercase">Invalidas</div>
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
                        {importMode === 'replace'
                          ? `${group.sourceRows.length} linha(s) da planilha vao substituir a carteira tecnica deste cliente`
                          : `${group.sourceRows.length} linha(s) da planilha serao mescladas a este cliente`}
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
                    <th className="px-4 py-3">Vinculo Encontrado</th>
                    <th className="px-4 py-3">Perfil / Categoria / Equipamento / Qtd</th>
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
                            <AlertTriangle size={14} /> Bloqueada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <AlertTriangle size={14} /> Invalida
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
                          <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase border border-emerald-100">Qtd {row.quantity}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resultMessage && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  {resultMessage}
                </div>

                {importReport && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3">
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Atualizados</p>
                      {importReport.updated.length > 0 ? (
                        <div className="space-y-2">
                          {importReport.updated.map(item => (
                            <div key={item} className="text-sm text-slate-700 font-medium">{item}</div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Nenhum cliente precisou de atualizacao.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-700">Sem Novidade</p>
                      {importReport.unchanged.length > 0 ? (
                        <div className="space-y-2">
                          {importReport.unchanged.map(item => (
                            <div key={item} className="text-sm text-slate-700 font-medium">{item}</div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Todos os clientes tinham algo novo para gravar.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-rose-200 bg-white p-4 space-y-3">
                      <p className="text-xs font-black uppercase tracking-widest text-rose-700">Erros</p>
                      {importReport.errors.length > 0 ? (
                        <div className="space-y-3">
                          {importReport.errors.map(error => (
                            <div key={`${error.clientName}-${error.reason}`} className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                              <p className="text-sm font-bold text-rose-700">{error.clientName}</p>
                              <p className="text-xs text-rose-600 mt-1">{error.reason}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Nenhum erro na transferencia.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setFile(null);
                  setPreviewRows([]);
                  setPreviewGroups([]);
                  setResultMessage(null);
                  setImportReport(null);
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
                    {importMode === 'replace' ? 'Corrigir Cadastros em Massa' : 'Vincular aos Cadastros'} <ArrowRight size={18} />
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
