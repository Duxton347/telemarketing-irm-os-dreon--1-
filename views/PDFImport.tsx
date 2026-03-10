import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Save, Loader2, ListPlus } from 'lucide-react';
import { dataService } from '../services/dataService';
import { parseAddress, parsePhones, ParsedAddress, ParsedPhone } from '../utils/addressParser';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Use Vite's asset import to load the worker properly
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ParsedClientRow {
    external_id: string;
    name: string;
    address_raw: string;
    phones_raw: string;
    parsed_address: ParsedAddress;
    parsed_phones: ParsedPhone;
    valid: boolean;
    error?: string;
}

const PDFImport: React.FC<{ user: any }> = ({ user }) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedClientRow[]>([]);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [results, setResults] = useState<{ processed: number; success: number; errors: number } | null>(null);
    const [debugText, setDebugText] = useState<string>('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setParsedData([]);
            setMessage(null);
            setResults(null);
        }
    };

    const processPDF = async () => {
        if (!file) return;

        setLoading(true);
        setMessage({ type: 'info', text: 'Lendo arquivo PDF, aguarde...' });
        setParsedData([]);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Step 1: Extract ALL text items with position from every page
            interface TextItem { str: string; x: number; y: number; page: number; }
            const allItems: TextItem[] = [];

            for (let i = 1; i <= pdfDocument.numPages; i++) {
                const page = await pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                const pageHeight = (page.view[3] - page.view[1]);

                for (const item of textContent.items as any[]) {
                    if (!item.str || !item.str.trim()) continue;
                    allItems.push({
                        str: item.str.trim(),
                        x: Math.round(item.transform[4]),
                        // Make Y global across pages (page 1 top = highest Y)
                        y: Math.round((i - 1) * 10000 + (pageHeight - item.transform[5])),
                        page: i
                    });
                }
            }

            // Step 2: Group items into rows by Y proximity
            allItems.sort((a, b) => a.y - b.y || a.x - b.x);

            const rows: TextItem[][] = [];
            let currentRow: TextItem[] = [];
            let currentY = -999;

            for (const item of allItems) {
                if (currentY === -999 || Math.abs(item.y - currentY) > 5) {
                    if (currentRow.length > 0) rows.push(currentRow);
                    currentRow = [item];
                    currentY = item.y;
                } else {
                    currentRow.push(item);
                }
            }
            if (currentRow.length > 0) rows.push(currentRow);

            // Step 3: Find header row by looking for known keywords
            const HEADER_KEYWORDS: Record<string, string> = {
                'id': 'id', 'nome': 'name', 'rua': 'street', 'endereço': 'street', 'endereco': 'street',
                'telefone principal': 'phone', 'telefone': 'phone', 'tel principal': 'phone', 'tel': 'phone',
                'telefone secundário': 'phone2', 'telefone secundario': 'phone2',
                'tel secundário': 'phone2', 'tel secundario': 'phone2',
                'bairro': 'neighborhood', 'cep': 'zip', 'cidade': 'city',
                'estado': 'state', 'uf': 'state', 'status': '_ignore',
            };

            let headerRowIdx = -1;
            // Column boundaries: { field: string, xStart: number, xEnd: number }
            interface ColBoundary { field: string; xCenter: number; }
            let colBoundaries: ColBoundary[] = [];

            for (let ri = 0; ri < rows.length; ri++) {
                const rowText = rows[ri].map(it => it.str).join(' ').toLowerCase();
                if (rowText.includes('nome') && (rowText.includes('telefone') || rowText.includes('tel') || rowText.includes('rua'))) {
                    headerRowIdx = ri;

                    // Build column boundaries from header items
                    // Only merge items that are VERY close (same word, e.g. "Telefone" + "principal")
                    const headerItems = [...rows[ri]].sort((a, b) => a.x - b.x);
                    const headerCells: { text: string; x: number }[] = [];

                    for (const item of headerItems) {
                        const lastCell = headerCells[headerCells.length - 1];
                        // Only merge if items are within 5px (same word/cell in PDF)
                        if (lastCell && Math.abs(item.x - lastCell.x) < 5) {
                            lastCell.text += ' ' + item.str;
                        } else {
                            headerCells.push({ text: item.str, x: item.x });
                        }
                    }

                    // Map each header cell to a field name
                    for (const cell of headerCells) {
                        const cellLower = cell.text.toLowerCase().trim();
                        let matched = false;

                        // Exact match first
                        if (HEADER_KEYWORDS[cellLower]) {
                            colBoundaries.push({ field: HEADER_KEYWORDS[cellLower], xCenter: cell.x });
                            matched = true;
                        }

                        if (!matched) {
                            // Partial match
                            for (const [keyword, field] of Object.entries(HEADER_KEYWORDS)) {
                                if (cellLower.includes(keyword)) {
                                    // Don't duplicate fields
                                    if (!colBoundaries.find(cb => cb.field === field)) {
                                        colBoundaries.push({ field, xCenter: cell.x });
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    // Sort boundaries by X position
                    colBoundaries.sort((a, b) => a.xCenter - b.xCenter);

                    // DEBUG: Log detected columns
                    console.log('[PDF Import] Header cells:', headerCells.map(c => `"${c.text}" (x=${c.x})`));
                    console.log('[PDF Import] Column boundaries:', colBoundaries.map(cb => `${cb.field} → x=${cb.xCenter}`));
                    break;
                }
            }

            // Step 4: Build midpoint-based column ranges
            // Each column owns the range from its left midpoint to its right midpoint
            interface ColRange { field: string; xStart: number; xEnd: number; }
            const colRanges: ColRange[] = [];

            for (let ci = 0; ci < colBoundaries.length; ci++) {
                const prev = ci > 0 ? colBoundaries[ci - 1].xCenter : 0;
                const curr = colBoundaries[ci].xCenter;
                const next = ci < colBoundaries.length - 1 ? colBoundaries[ci + 1].xCenter : 99999;

                colRanges.push({
                    field: colBoundaries[ci].field,
                    xStart: ci === 0 ? 0 : Math.round((prev + curr) / 2),
                    xEnd: ci === colBoundaries.length - 1 ? 99999 : Math.round((curr + next) / 2)
                });
            }

            console.log('[PDF Import] Column ranges:', colRanges.map(cr => `${cr.field}: ${cr.xStart}-${cr.xEnd}`));

            // Parse data rows using column ranges
            const cleanPhone = (raw: string): string => {
                let cleaned = raw.replace(/\D/g, '');
                if (cleaned.startsWith('0') && cleaned.length > 10) cleaned = cleaned.substring(1);
                return cleaned;
            };

            const assignToColumn = (x: number): string => {
                if (colRanges.length === 0) return '';
                for (const cr of colRanges) {
                    if (x >= cr.xStart && x < cr.xEnd) return cr.field;
                }
                return colRanges[colRanges.length - 1].field; // fallback to last column
            };

            const extractedRows: ParsedClientRow[] = [];
            const dataRows = headerRowIdx >= 0 ? rows.slice(headerRowIdx + 1) : rows;

            for (const row of dataRows) {
                // Build a record of field -> text for this row
                const record: Record<string, string> = {};

                for (const item of row) {
                    const field = assignToColumn(item.x);
                    if (!field || field === '_ignore') continue;

                    if (record[field]) {
                        record[field] += ' ' + item.str;
                    } else {
                        record[field] = item.str;
                    }
                }

                const nameVal = record['name'] || '';
                if (!nameVal || nameVal.toLowerCase() === 'nome') continue;

                const idVal = record['id'] || '';
                if (idVal.toLowerCase() === 'id') continue;

                const streetVal = record['street'] || '';
                const phoneRaw = record['phone'] || '';
                const phone2Raw = record['phone2'] || '';
                const neighborhoodVal = record['neighborhood'] || '';
                const zipVal = record['zip'] || '';
                const cityVal = record['city'] || '';
                const stateVal = record['state'] || '';

                const primaryPhone = cleanPhone(phoneRaw);
                const secondaryPhone = phone2Raw ? cleanPhone(phone2Raw) : undefined;

                const addressRaw = [streetVal, neighborhoodVal, cityVal, stateVal, zipVal].filter(Boolean).join(', ');

                extractedRows.push({
                    external_id: idVal.match(/^\d+$/) ? idVal : '',
                    name: nameVal,
                    address_raw: addressRaw,
                    phones_raw: phone2Raw ? `${phoneRaw} / ${phone2Raw}` : phoneRaw,
                    parsed_address: {
                        street: streetVal || undefined,
                        neighborhood: neighborhoodVal || undefined,
                        city: cityVal || undefined,
                        state: stateVal || undefined,
                        zip_code: zipVal ? zipVal.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2') : undefined,
                    },
                    parsed_phones: {
                        primary: primaryPhone,
                        secondary: secondaryPhone && secondaryPhone.length >= 10 ? secondaryPhone : undefined,
                    },
                    valid: primaryPhone.length >= 10,
                    error: primaryPhone.length < 10 ? 'Telefone primário inválido' : undefined
                });
            }

            // DEBUG: Log first 3 rows for verification
            if (extractedRows.length > 0) {
                console.log('[PDF Import] Sample rows:', extractedRows.slice(0, 3).map(r => ({
                    id: r.external_id, name: r.name,
                    street: r.parsed_address.street, neighborhood: r.parsed_address.neighborhood,
                    city: r.parsed_address.city, state: r.parsed_address.state,
                    phone: r.parsed_phones.primary, phone2: r.parsed_phones.secondary
                })));
            }

            // Build debug text
            let dbg = `Colunas detectadas (${colRanges.length}):\n`;
            colRanges.forEach(cr => { dbg += `  ${cr.field} → X range: ${cr.xStart} - ${cr.xEnd}\n`; });
            dbg += `\nLinhas de dados: ${dataRows.length}\nLinhas válidas: ${extractedRows.length}\n`;
            if (extractedRows.length > 0) {
                dbg += `\nAmostra (linha 1):\n`;
                const s = extractedRows[0];
                dbg += `  ID: ${s.external_id}\n  Nome: ${s.name}\n  Rua: ${s.parsed_address.street || '-'}\n  Bairro: ${s.parsed_address.neighborhood || '-'}\n  Cidade: ${s.parsed_address.city || '-'}\n  Estado: ${s.parsed_address.state || '-'}\n  CEP: ${s.parsed_address.zip_code || '-'}\n  Tel1: ${s.parsed_phones.primary}\n  Tel2: ${s.parsed_phones.secondary || '-'}\n`;
            }
            setDebugText(dbg);

            if (extractedRows.length === 0) {
                setMessage({ type: 'error', text: 'Nenhum cliente válido foi encontrado. Verifique o layout do PDF.' });
            } else {
                setParsedData(extractedRows);
                setMessage({ type: 'success', text: `Encontrados ${extractedRows.length} clientes. Revise os dados abaixo e clique em Importar.` });
            }

        } catch (error: any) {
            console.error(error);
            setMessage({ type: 'error', text: `Erro ao ler PDF: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (parsedData.length === 0) return;

        setImporting(true);
        setMessage({ type: 'info', text: 'Importando clientes, aguarde...' });

        let success = 0;
        let errors = 0;

        for (const row of parsedData) {
            if (!row.valid) {
                errors++;
                continue;
            }

            try {
                // Upsert logic applies
                await dataService.upsertClient({
                    external_id: row.external_id,
                    name: row.name,
                    phone: row.parsed_phones.primary,
                    phone_secondary: row.parsed_phones.secondary,
                    address: row.address_raw,
                    street: row.parsed_address.street,
                    neighborhood: row.parsed_address.neighborhood,
                    city: row.parsed_address.city,
                    state: row.parsed_address.state,
                    zip_code: row.parsed_address.zip_code,
                    status: 'CLIENT', // As per requirements
                    origin: 'CSV_IMPORT'
                });
                success++;
            } catch (err) {
                console.error(`Error importing row: ${row.name}`, err);
                errors++;
            }
        }

        setResults({ processed: parsedData.length, success, errors });
        setMessage({
            type: success > 0 ? 'success' : 'error',
            text: `Importação concluída: ${success} salvos, ${errors} erros.`
        });
        setImporting(false);
        setParsedData([]); // Clear table after success
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <FileText className="text-blue-600" size={32} /> Importação de PDF (Clientes)
                </h2>
                <p className="text-slate-500 mt-2 font-medium">Extraia clientes de arquivos PDF gerados por outros sistemas (Cadastro de Compradores).</p>
            </div>

            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8 space-y-8">

                {/* UPOLAD SECTION */}
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[24px] p-8 flex flex-col items-center justify-center text-center">
                    <Upload size={48} className="text-blue-400 mb-4" />
                    <h3 className="text-lg font-black text-slate-700 uppercase tracking-widest mb-2">Selecione o arquivo PDF</h3>
                    <p className="text-sm font-bold text-slate-500 mb-6 max-w-md">
                        O arquivo deve conter colunas: ID, Nome, Rua, Telefone principal, Telefone secundário, Bairro, CEP, Cidade, Estado.
                    </p>
                    <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="block w-full max-w-sm text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-black file:uppercase file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all mb-4 cursor-pointer"
                    />

                    {file && !loading && parsedData.length === 0 && (
                        <button
                            onClick={processPDF}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2"
                        >
                            <ListPlus size={18} /> Parsear Arquivo
                        </button>
                    )}
                </div>

                {/* MESSAGES */}
                {message && (
                    <div className={`p-5 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                            'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                        {message.type === 'success' && <CheckCircle2 size={24} />}
                        {message.type === 'error' && <AlertCircle size={24} />}
                        {message.type === 'info' && <Loader2 size={24} className="animate-spin" />}
                        <span className="font-bold">{message.text}</span>
                    </div>
                )}

                {/* RESULTS */}
                {results && (
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Processado</p>
                            <p className="text-3xl font-black text-slate-700">{results.processed}</p>
                        </div>
                        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Sucesso</p>
                            <p className="text-3xl font-black text-emerald-700">{results.success}</p>
                        </div>
                        <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Erros/Falhas</p>
                            <p className="text-3xl font-black text-rose-700">{results.errors}</p>
                        </div>
                    </div>
                )}

                {/* DEBUG INFO */}
                {debugText && (
                    <details className="bg-slate-900 rounded-2xl overflow-hidden">
                        <summary className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:text-white transition-colors">
                            🔍 Debug: Colunas Detectadas (clique para expandir)
                        </summary>
                        <pre className="px-6 pb-4 text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto">{debugText}</pre>
                    </details>
                )}

                {/* PREVIEW TABLE */}
                {parsedData.length > 0 && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <ListPlus size={20} className="text-blue-500" /> Preview dos Dados
                            </h3>
                            <button
                                onClick={handleImport}
                                disabled={importing}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-md active:scale-95 flex items-center gap-2"
                            >
                                {importing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Importar para o Banco
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto max-h-[500px] overflow-y-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-100 text-slate-500 font-black uppercase text-[10px] tracking-widest sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">ID Ext</th>
                                        <th className="px-4 py-3">Nome</th>
                                        <th className="px-4 py-3">Tel Primário</th>
                                        <th className="px-4 py-3">Tel Secundário</th>
                                        <th className="px-4 py-3">Rua</th>
                                        <th className="px-4 py-3">Bairro</th>
                                        <th className="px-4 py-3">Cidade</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/50">
                                    {parsedData.map((row, idx) => (
                                        <tr key={idx} className={!row.valid ? "bg-rose-50/50 text-rose-700" : "text-slate-700"}>
                                            <td className="px-4 py-3 font-bold">
                                                {row.valid ? (
                                                    <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> OK</span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-rose-600" title={row.error}><AlertCircle size={14} /> Erro</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">{row.external_id || '-'}</td>
                                            <td className="px-4 py-3 font-bold truncate max-w-[150px]">{row.name}</td>
                                            <td className="px-4 py-3 font-bold">{row.parsed_phones.primary}</td>
                                            <td className="px-4 py-3 text-slate-500">{row.parsed_phones.secondary || '-'}</td>
                                            <td className="px-4 py-3 truncate max-w-[150px] text-slate-600">{row.parsed_address.street || '-'}</td>
                                            <td className="px-4 py-3 font-bold text-slate-700">{row.parsed_address.neighborhood || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600">{row.parsed_address.city || '-'} ({row.parsed_address.state || '-'})</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PDFImport;
