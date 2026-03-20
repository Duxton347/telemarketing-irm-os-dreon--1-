import React, { useState } from 'react';
import { Database, FileSpreadsheet, Sparkles, Tag, Users } from 'lucide-react';
import { SmartImportModal } from '../components/SmartImportModal';
import { ProductImport } from './ProductImport'; // Reuse existing component
import { CustomerPortfolioImport } from './CustomerPortfolioImport';
import { TagApprovalCard } from '../components/TagApprovalCard';
import { dataService } from '../services/dataService';

export const DataCenter: React.FC<{ user: any }> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'SMART_IMPORT' | 'PORTFOLIO' | 'PRODUCTS' | 'TAGS'>('SMART_IMPORT');
    const [isSmartImportOpen, setIsSmartImportOpen] = useState(false);
    const [pendingTags, setPendingTags] = useState<any[]>([]);

    React.useEffect(() => {
        if (activeTab === 'TAGS') {
            loadTags();
        }
    }, [activeTab]);

    const loadTags = async () => {
        try {
            const tags = await dataService.getClientTags();
            // Assuming dataService.getClientTags returns all. Let's filter SUGERIDA manually or adjust if needed.
            setPendingTags(tags.filter(t => t.status === 'SUGERIDA' || t.status === 'CONFIRMADA_OPERADOR'));
        } catch (e) {
            console.error("Erro ao carregar tags", e);
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto space-y-8">
            <header>
                <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                    <Database className="text-blue-600" />
                    Central de Dados
                </h1>
                <p className="text-slate-500 font-medium">Gerencie importações em massa e inteligência de tags.</p>
            </header>

            <div className="flex gap-4 border-b border-slate-200 pb-4">
                <button
                    onClick={() => setActiveTab('SMART_IMPORT')}
                    className={`pb-2 px-4 font-black uppercase text-[11px] tracking-widest transition-all border-b-2 ${activeTab === 'SMART_IMPORT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <FileSpreadsheet size={16} className="inline mr-2" /> Importação Inteligente
                </button>
                <button
                    onClick={() => setActiveTab('PORTFOLIO')}
                    className={`pb-2 px-4 font-black uppercase text-[11px] tracking-widest transition-all border-b-2 ${activeTab === 'PORTFOLIO' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <Sparkles size={16} className="inline mr-2" /> Perfil & Equipamentos
                </button>
                <button
                    onClick={() => setActiveTab('PRODUCTS')}
                    className={`pb-2 px-4 font-black uppercase text-[11px] tracking-widest transition-all border-b-2 ${activeTab === 'PRODUCTS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <Sparkles size={16} className="inline mr-2" /> Produtos (Orçamentos)
                </button>
                <button
                    onClick={() => setActiveTab('TAGS')}
                    className={`pb-2 px-4 font-black uppercase text-[11px] tracking-widest transition-all border-b-2 ${activeTab === 'TAGS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <Tag size={16} className="inline mr-2" /> Tags e IA
                </button>
            </div>

            <div>
                {activeTab === 'SMART_IMPORT' && (
                    <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col items-center justify-center text-center space-y-6">
                        <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                            <Users size={32} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 mb-2">Subir Base de Clientes (Excel/CSV)</h3>
                            <p className="text-slate-500 max-w-md mx-auto">O sistema mapeia automaticamente as colunas Nome, Telefone e Endereço para cadastrar os clientes compradores no módulo correto.</p>
                        </div>
                        <button
                            onClick={() => setIsSmartImportOpen(true)}
                            className="px-8 py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95"
                        >
                            <FileSpreadsheet size={16} className="inline mr-2" /> Iniciar Importação Inteligente
                        </button>
                    </div>
                )}

                {activeTab === 'PRODUCTS' && (
                    <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                        <ProductImport />
                    </div>
                )}

                {activeTab === 'PORTFOLIO' && (
                    <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                        <CustomerPortfolioImport />
                    </div>
                )}

                {activeTab === 'TAGS' && (
                    <div className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Aprovação de Tags Pendentes</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {pendingTags.map(tag => (
                                <TagApprovalCard
                                    key={tag.id}
                                    tag={tag}
                                    onRefresh={loadTags}
                                    operatorId={user?.id || ''}
                                    isSupervisor={true}
                                />
                            ))}
                            {pendingTags.length === 0 && (
                                <div className="col-span-full py-10 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                                    Nenhuma tag pendente de aprovação.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <SmartImportModal
                isOpen={isSmartImportOpen}
                onClose={() => setIsSmartImportOpen(false)}
                onSuccess={() => alert("Importação concluída com sucesso! Os clientes já constam no banco de dados.")}
            />
        </div>
    );
};
