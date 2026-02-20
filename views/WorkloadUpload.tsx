import React, { useState, useEffect } from 'react';
import { Upload, Plus, ClipboardPaste, Save, Phone, User as UserIcon, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';
import { dataService } from '../services/dataService';
import { User, UserRole, CallType } from '../types';

interface Props {
    user: any;
}

const WorkloadUpload: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'manual' | 'paste'>('manual');
    const [operators, setOperators] = useState<User[]>([]);
    const [selectedOperator, setSelectedOperator] = useState<string>('');

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
                const ops = await dataService.listUsers();
                setOperators(ops.filter(o => o.role !== UserRole.ADMIN));
            } catch (e) {
                console.error(e);
            }
        };
        fetchOps();
    }, []);

    const normalizePhone = (p: string) => p.replace(/\D/g, '');

    const createInitialTasks = async (clientIds: string[]) => {
        try {
            const tasks = clientIds.map(id => ({
                clientId: id,
                type: CallType.PROSPECCAO,
                assignedTo: selectedOperator || null,
                status: 'pending',
                scheduleReason: 'Carga de Trabalho - Contato Inicial'
            }));
            await dataService.bulkCreateTasks(tasks);
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
            const prospect = { name: manualName, phone: normalizePhone(manualPhone), status: 'LEAD' as any, origin: 'MANUAL' as const };
            const [created] = await dataService.upsertProspectsFromWorkload([prospect]);

            if (created) {
                await createInitialTasks([created.id]);
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

    const handlePasteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pasteData.trim()) return;

        setLoading(true);
        setMessage(null);

        try {
            const lines = pasteData.split('\n').filter(l => l.trim().length > 0);
            const prospects = lines.map(line => {
                const phoneMatch = line.match(/(?:\+?55|0)?\s?(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/);

                let phone = '';
                let name = line;

                if (phoneMatch) {
                    phone = phoneMatch[1] || phoneMatch[0];
                    name = line.replace(phoneMatch[0], '').trim();
                    name = name.replace(/^[-,\s]+|[-,\s]+$/g, '');
                } else {
                    const parts = line.split(/[\t;|,]/);
                    if (parts.length >= 2) {
                        name = parts[0].trim();
                        phone = parts[1].trim();
                    }
                }

                if (!name) name = 'Sem Nome';

                return {
                    name,
                    phone: normalizePhone(phone),
                    status: 'LEAD' as any,
                    origin: 'CSV_IMPORT' as const
                };
            }).filter(p => p.phone.length >= 8);

            if (prospects.length === 0) {
                setMessage({ type: 'error', text: 'Nenhum prospect válido encontrado na lista.' });
                setLoading(false);
                return;
            }

            const createdList = await dataService.upsertProspectsFromWorkload(prospects);
            if (createdList.length > 0) {
                await createInitialTasks(createdList.map(c => c.id));
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
                <div className="mb-8 p-6 bg-blue-50/50 rounded-3xl border border-blue-100/50">
                    <label className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2 mb-3">
                        <UserCheck size={14} className="text-blue-500" /> Atribuir Contato Inicial Para:
                    </label>
                    <select
                        value={selectedOperator}
                        onChange={e => setSelectedOperator(e.target.value)}
                        className="w-full max-w-sm bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">Fila Geral (Nenhum operador específico)</option>
                        {operators.map(op => (
                            <option key={op.id} value={op.id}>{op.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-2 italic">Novos leads automaticamente gerarão uma task de PROSPECÇÃO para a fila definida acima.</p>
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
                                <ClipboardPaste size={14} /> Cole sua lista (Nome e Telefone)
                            </label>
                            <textarea
                                value={pasteData} onChange={e => setPasteData(e.target.value)}
                                placeholder={'Exemplo:\nJoão Silva\t(11) 98765-4321\nMaria Oliveira\t(21) 99999-8888\n...'} required
                                rows={10}
                                className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-4 font-mono text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y"
                            />
                            <p className="text-xs text-slate-400 mt-2 font-medium">Você pode colar do Excel (tabulação) ou linhas com Nome e Telefone juntos. O sistema extrairá o número automaticamente.</p>
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
