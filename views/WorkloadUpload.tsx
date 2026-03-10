import React, { useState, useEffect } from 'react';
import { Upload, Plus, ClipboardPaste, Save, Phone, User as UserIcon, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';
import { dataService } from '../services/dataService';
import { User, UserRole, CallType } from '../types';
import { parseAddress } from '../utils/addressParser';

interface Props {
    user: any;
}

const WorkloadUpload: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'manual' | 'paste'>('manual');
    const [operators, setOperators] = useState<User[]>([]);
    const [selectedOperator, setSelectedOperator] = useState<string>('');

    // Selected Contact Settings
    const [selectedCallType, setSelectedCallType] = useState<CallType>(CallType.POS_VENDA);
    const [selectedChannel, setSelectedChannel] = useState<'CALL' | 'WHATSAPP'>('CALL');

    // Manual Entry Form
    const [manualName, setManualName] = useState('');
    const [manualPhone, setManualPhone] = useState('');

    // Paste Form
    const [pasteData, setPasteData] = useState('');

    // Status
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const fetchOps = async () => {
            try {
                const ops = await dataService.getUsers();
                setOperators(ops.filter(o => o.role !== UserRole.ADMIN));
            } catch (e) {
                console.error(e);
            }
        };
        fetchOps();
    }, []);

    const normalizePhone = (p: string) => p.replace(/\D/g, '');

    const createInitialTasks = async (clientIds: string[], type: CallType, isWhatsApp: boolean) => {
        try {
            if (isWhatsApp) {
                // Bulk insert WhatsApp tasks
                const waTasks = clientIds.map(id => ({
                    clientId: id,
                    assignedTo: selectedOperator || undefined,
                    status: 'pending' as any,
                    type: type,
                    source: 'manual' as const
                }));
                // dataService doesn't have bulkCreateWhatsAppTasks, loop with Promise.all
                await Promise.all(waTasks.map(t => dataService.createWhatsAppTask(t)));
            } else {
                const tasks = clientIds.map(id => ({
                    clientId: id,
                    type: type,
                    assignedTo: selectedOperator || null,
                    status: 'pending',
                    scheduleReason: `Carga de Trabalho - Contato Inicial (${type})`
                }));
                await dataService.bulkCreateTasks(tasks);
            }
        } catch (e) {
            console.error('Failed to create initial tasks', e);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualName || !manualPhone) return;

        setLoading(true);
        setMessage(null);
        try {
            const isPosVenda = selectedCallType === CallType.POS_VENDA;
            const prospect = {
                name: manualName,
                phone: normalizePhone(manualPhone),
                status: 'LEAD' as any,
                origin: 'MANUAL' as const
            };
            const created = await dataService.upsertClient(prospect);

            if (created && created.id) {
                await createInitialTasks([created.id], selectedCallType, selectedChannel === 'WHATSAPP');
                setMessage({ type: 'success', text: `Prospect '${created.name}' criado com sucesso!` });
                setManualName('');
                setManualPhone('');
            } else {
                setMessage({ type: 'error', text: 'Não foi possível criar o prospect.' });
            }
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message || 'Erro ao criar prospect.' });
        } finally {
            setLoading(false);
        }
    };

    const parseCSVLine = (text: string): string[] => {
        const result: string[] = [];
        let insideQuotes = false;
        let currentValue = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '"' || char === "'") {
                insideQuotes = !insideQuotes;
            } else if ((char === ',' || char === ';' || char === '\t') && !insideQuotes) {
                result.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        result.push(currentValue.trim());
        return result;
    };

    const handlePasteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pasteData.trim()) return;

        setLoading(true);
        setMessage(null);

        try {
            const lines = pasteData.split(/\r?\n/).filter(l => l.trim().length > 0);
            const prospectsToCreate = lines.map((line, index) => {
                if (index === 0 && (line.toLowerCase().includes('nome') && line.toLowerCase().includes('telefone'))) {
                    // Ignore header line
                    return null;
                }

                const isPosVenda = selectedCallType === CallType.POS_VENDA;
                const isReativacao = selectedCallType === CallType.REATIVACAO;

                const parts = parseCSVLine(line);
                let name = 'Sem Nome';
                let phone = '';
                let extra = ''; // Equipamento or Oferta
                let address = '';
                let lastPurchaseDate: string | undefined = undefined;

                if (isReativacao && parts.length >= 4) {
                    // Esperado: Data Última Compra, Endereço, Nome, Telefone
                    lastPurchaseDate = parts[0];
                    address = parts[1];
                    name = parts[2];
                    phone = parts[3];
                } else if (!isReativacao && parts.length >= 4) {
                    name = parts[0];
                    phone = parts[1];
                    extra = parts[2];
                    address = parts[3];
                } else if (!isReativacao && parts.length >= 2) {
                    name = parts[0];
                    phone = parts[1];
                    extra = parts[2] || '';
                } else if (isReativacao && parts.length >= 2) {
                    // Fallback para reativação caso faltem colunas
                    name = parts[2] || parts[0] || 'Sem Nome';
                    phone = parts[3] || parts[1] || '';
                    address = parts[1] || '';
                    lastPurchaseDate = parts[0] || undefined;
                } else {
                    const phoneMatch = line.match(/(?:\+?55|0)?\s?(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/);
                    if (phoneMatch) {
                        phone = phoneMatch[1] || phoneMatch[0];
                        name = line.replace(phoneMatch[0], '').trim().replace(/^[-,\s]+|[-,\s]+$/g, '');
                    } else {
                        name = line;
                    }
                }

                if (!name) name = 'Sem Nome';

                const parsedAddress = parseAddress(address);

                return {
                    name,
                    phone: normalizePhone(phone),
                    address,
                    street: parsedAddress.street,
                    neighborhood: parsedAddress.neighborhood,
                    city: parsedAddress.city,
                    state: parsedAddress.state,
                    zip_code: parsedAddress.zip_code,
                    last_purchase_date: lastPurchaseDate,
                    items: isPosVenda && extra ? [extra] : [],
                    offers: (!isPosVenda && !isReativacao) && extra ? [extra] : [],
                    status: isReativacao ? 'INATIVO' as any : 'LEAD' as any,
                    origin: 'CSV_IMPORT' as const
                };
            }).filter(p => p !== null && p.phone.length >= 8);

            if (prospectsToCreate.length === 0) {
                setMessage({ type: 'error', text: 'Nenhum prospect válido encontrado na lista.' });
                setLoading(false);
                return;
            }

            const createdList = [];
            for (const prospect of prospectsToCreate) {
                try {
                    const created = await dataService.upsertClient(prospect);
                    createdList.push(created);
                } catch (e) {
                    console.error('Failed to upsert client', e);
                }
            }

            if (createdList.length > 0) {
                await createInitialTasks(createdList.map(c => c.id), selectedCallType, selectedChannel === 'WHATSAPP');
            }

            setMessage({ type: 'success', text: `${createdList.length} prospects processados e criados com sucesso!` });
            setPasteData('');

        } catch (e: any) {
            setMessage({ type: 'error', text: e.message || 'Erro ao processar lista.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <Upload className="text-blue-600" size={32} /> Carga de Trabalho
                </h2>
                <p className="text-slate-500 mt-2 font-medium">Adicione novos leads e prospects ao sistema rapidamente.</p>
            </div>

            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8">

                {/* Global Options */}
                <div className="mb-8 p-6 bg-blue-50/50 rounded-3xl border border-blue-100/50 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2 mb-3">
                            <UserCheck size={14} className="text-blue-500" /> Atribuir Contato Inicial Para:
                        </label>
                        <select
                            value={selectedOperator}
                            onChange={e => setSelectedOperator(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">Fila Geral (Nenhum operador específico)</option>
                            {operators.map(op => (
                                <option key={op.id} value={op.id}>{op.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2 mb-3">
                                <Plus size={14} className="text-blue-500" /> Tipo da Carga:
                            </label>
                            <select
                                value={selectedCallType}
                                onChange={e => setSelectedCallType(e.target.value as CallType)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value={CallType.POS_VENDA}>PÓS-VENDA (Equipamento)</option>
                                <option value={CallType.PROSPECCAO}>PROSPECÇÃO (Oferta)</option>
                                <option value={CallType.VENDA}>VENDA (Oferta)</option>
                                <option value={CallType.REATIVACAO}>REATIVAÇÃO (Clientes Inativos)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2 mb-3">
                                <Phone size={14} className="text-blue-500" /> Direcionar Para Canal de Contato:
                            </label>
                            <select
                                value={selectedChannel}
                                onChange={e => setSelectedChannel(e.target.value as 'CALL' | 'WHATSAPP')}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="CALL">LIGAÇÃO (Fila de Tarefas)</option>
                                <option value="WHATSAPP">WHATSAPP (Fila de Mensagens)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* TABS */}
                <div className="flex bg-slate-50 p-2 rounded-2xl w-max mb-8">
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeTab === 'manual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        <Plus size={16} /> Individual
                    </button>
                    <button
                        onClick={() => setActiveTab('paste')}
                        className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeTab === 'paste' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        <ClipboardPaste size={16} /> Colar Lista
                    </button>
                </div>

                {message && (
                    <div className={`p-4 rounded-2xl mb-8 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        <span className="font-bold">{message.text}</span>
                    </div>
                )}

                {/* MANUAL FORM */}
                {activeTab === 'manual' && (
                    <form onSubmit={handleManualSubmit} className="space-y-6 max-w-lg animate-in fade-in slide-in-from-left-4">
                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><UserIcon size={14} /> Nome do Lead</label>
                            <input
                                type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                                placeholder="Ex: João Silva" required
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2"><Phone size={14} /> Telefone</label>
                            <input
                                type="text" value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                                placeholder="(11) 98765-4321" required
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <button
                            type="submit" disabled={loading}
                            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
                        >
                            {loading ? 'Salvando...' : <><Save size={18} /> Cadastrar Prospect</>}
                        </button>
                    </form>
                )}

                {/* PASTE FORM */}
                {activeTab === 'paste' && (
                    <form onSubmit={handlePasteSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4">
                        <div>
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2">
                                <ClipboardPaste size={14} />
                                {selectedCallType === CallType.REATIVACAO
                                    ? 'Cole sua lista (Data Última Compra, Endereço, Nome, Telefone)'
                                    : 'Cole sua lista (Nome, Telefone, Equipamento/Oferta, Endereço)'}
                            </label>
                            <textarea
                                value={pasteData} onChange={e => setPasteData(e.target.value)}
                                placeholder={selectedCallType === CallType.REATIVACAO
                                    ? 'Exemplo:\n10/05/2021, "Rua das flores, 123", João Silva, (11) 98765-4321'
                                    : 'Exemplo:\nJoão Silva, (11) 98765-4321, AQUECEDOR, "Rua das flores, 123"'} required
                                rows={10}
                                className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-4 font-mono text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y"
                            />
                            <p className="text-xs text-slate-400 mt-2 font-medium">
                                {selectedCallType === CallType.REATIVACAO
                                    ? 'A ordem para reativação DEVE SER: Data Última Compra, Endereço, Nome, Telefone.'
                                    : 'Você pode colar do Excel ou CSV usando colunas. Recomenda-se a ordem: Nome, Telefone, Equipamento/Oferta, Endereço.'}
                            </p>
                        </div>
                        <button
                            type="submit" disabled={loading}
                            className="py-4 px-8 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
                        >
                            {loading ? 'Processando...' : <><Save size={18} /> Processar e Importar</>}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default WorkloadUpload;
