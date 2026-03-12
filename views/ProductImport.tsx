import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import * as xlsx from 'xlsx';
import { supabase } from '../lib/supabase';
import { CampaignPlannerService } from '../services/campaignPlannerService';

interface PreviewRow {
  nameRaw: string;
  nameNormalized: string;
  detectedProducts: string[];
  matchedClientId: string | null;
  status: 'READY' | 'NOT_FOUND';
}

export const ProductImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState({ total: 0, found: 0, updated: 0 });

  const normalizeName = (nameRaw: any): string => {
    if (!nameRaw) return '';
    return String(nameRaw)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);

    try {
      // 1. Parse Excel/CSV
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

          if (jsonData.length === 0) {
            alert('Arquivo vazio.');
            setLoading(false);
            return;
          }

          // 2. Identify "Nome" column
          const headers = Object.keys(jsonData[0]);
          const nameCol = headers.find(h => h.toLowerCase().includes('nome') || h.toLowerCase().includes('cliente'));
          
          if (!nameCol) {
            alert('Coluna "Nome" ou "Cliente" não encontrada no cabeçalho.');
            setLoading(false);
            return;
          }

          const productCols = headers.filter(h => h !== nameCol);

          // 3. Process rows and find matches in DB
          // Fetch all clients to match locally for speed (assuming base is not millions, else we'd batch query)
          const { data: allClients } = await supabase.from('clients').select('id, name');
          const clientMap = new Map<string, string>();
          
          if (allClients) {
            allClients.forEach(c => {
              clientMap.set(normalizeName(c.name), c.id);
            });
          }

          const preview: PreviewRow[] = jsonData.map(row => {
            const rawName = String(row[nameCol] || '');
            const normalized = normalizeName(rawName);
            const clientId = clientMap.get(normalized) || null;
            
            const products: string[] = [];
            for (const pCol of productCols) {
              const pVal = String(row[pCol] || '').trim();
              if (pVal) products.push(pVal);
            }

            return {
              nameRaw: rawName,
              nameNormalized: normalized,
              detectedProducts: products,
              matchedClientId: clientId,
              status: clientId ? ('READY' as const) : ('NOT_FOUND' as const)
            };
          }).filter(r => r.nameRaw);

          setPreviewData(preview);
          setStats({
            total: preview.length,
            found: preview.filter(p => p.status === 'READY').length,
            updated: 0
          });

        } catch (err) {
          console.error(err);
          alert('Erro ao processar arquivo.');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(uploadedFile);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const executeImport = async () => {
    const readyItems = previewData.filter(p => p.status === 'READY' && p.matchedClientId && p.detectedProducts.length > 0);
    if (readyItems.length === 0) return;

    setImporting(true);
    try {
      const updates = readyItems.map(item => ({
        clientId: item.matchedClientId as string,
        products: item.detectedProducts
      }));

      const updatedCount = await CampaignPlannerService.bulkUpdateClientProducts(updates);
      setStats(prev => ({ ...prev, updated: updatedCount }));
      alert(`Importação concluída! ${updatedCount} clientes tiveram seus produtos atualizados.`);
    } catch (err) {
      console.error(err);
      alert('Erro ao importar produtos.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="text-blue-600" />
          Importação de Produtos em Massa
        </h1>
      </div>

      <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Instruções</h2>
          <p className="text-sm text-slate-600">
            Faça upload de um arquivo Excel (.xlsx) ou CSV contendo uma coluna para o nome do cliente (ex: "Nome", "Cliente") e as demais colunas com os produtos que ele possui. O sistema buscará o cliente pelo nome exato (ignorando acentos e maiúsculas/minúsculas) e adicionará os produtos ao cadastro dele sem duplicar se já existirem.
          </p>
          <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-600">
            Exemplo:<br/>
            Nome,Produto 1,Produto 2<br/>
            João Silva,Químicos,Fotovoltaico<br/>
            Maria Santos,Manutenção,
          </div>
        </div>

        {!file && (
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
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
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-slate-600">Processando arquivo e buscando clientes...</p>
          </div>
        )}

        {previewData.length > 0 && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                <div className="text-2xl font-black text-slate-800">{stats.total}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Linhas Lidas</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                <div className="text-2xl font-black text-blue-700">{stats.found}</div>
                <div className="text-xs font-semibold text-blue-600 uppercase">Clientes Encontrados</div>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                <div className="text-2xl font-black text-emerald-700">{stats.updated || '-'}</div>
                <div className="text-xs font-semibold text-emerald-600 uppercase">Clientes Atualizados</div>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Nome no Arquivo</th>
                    <th className="px-4 py-3">Produtos Detectados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {previewData.map((row, idx) => (
                    <tr key={idx} className={row.status === 'READY' ? 'bg-white' : 'bg-red-50'}>
                      <td className="px-4 py-3 font-medium">
                        {row.status === 'READY' ? (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle size={14} /> Encontrado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertCircle size={14} /> Não Encontrado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{row.nameRaw}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.detectedProducts.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.detectedProducts.map((p, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Nenhum</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => { setFile(null); setPreviewData([]); }}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={importing}
              >
                Cancelar
              </button>
              <button
                onClick={executeImport}
                disabled={stats.found === 0 || importing || stats.updated > 0}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
              >
                {importing ? (
                  'Importando...'
                ) : stats.updated > 0 ? (
                  'Concluído'
                ) : (
                  <>Adicionar Produtos aos Clientes <ArrowRight size={18} /></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
