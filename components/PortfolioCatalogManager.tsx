import React from 'react';
import {
  Boxes,
  FolderTree,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2
} from 'lucide-react';
import { PortfolioCatalogService } from '../services/portfolioCatalogService';
import {
  PortfolioCatalogConfig,
  sanitizePortfolioCatalogConfig
} from '../utils/portfolioCatalog';

interface PortfolioCatalogManagerProps {
  onCatalogChange?: (catalog: PortfolioCatalogConfig) => void;
}

const createEmptyProductDraft = () => ({
  name: '',
  category: '',
  aliases: ''
});

export const PortfolioCatalogManager: React.FC<PortfolioCatalogManagerProps> = ({ onCatalogChange }) => {
  const [catalog, setCatalog] = React.useState<PortfolioCatalogConfig>(sanitizePortfolioCatalogConfig());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [newProduct, setNewProduct] = React.useState(createEmptyProductDraft);
  const onCatalogChangeRef = React.useRef(onCatalogChange);

  React.useEffect(() => {
    onCatalogChangeRef.current = onCatalogChange;
  }, [onCatalogChange]);

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const nextCatalog = await PortfolioCatalogService.getCatalogConfig();
      setCatalog(nextCatalog);
      onCatalogChangeRef.current?.(nextCatalog);
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao carregar o catalogo tecnico.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const activeCategoryOptions = React.useMemo(
    () => catalog.categories.filter(category => category.active),
    [catalog.categories]
  );

  const filteredProducts = React.useMemo(() => {
    const comparableSearch = search.trim().toLowerCase();
    if (!comparableSearch) return catalog.products;

    return catalog.products.filter(product =>
      [product.name, product.category, ...(product.aliases || [])]
        .join(' ')
        .toLowerCase()
        .includes(comparableSearch)
    );
  }, [catalog.products, search]);

  const productCountByCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    catalog.products.forEach(product => {
      map.set(product.category, (map.get(product.category) || 0) + 1);
    });
    return map;
  }, [catalog.products]);

  const updateCategory = (categoryId: string, updates: Partial<PortfolioCatalogConfig['categories'][number]>) => {
    setCatalog(current => sanitizePortfolioCatalogConfig({
      ...current,
      categories: current.categories.map(category =>
        category.id === categoryId ? { ...category, ...updates } : category
      )
    }));
  };

  const addCategory = () => {
    const nextName = newCategoryName.trim().toUpperCase();
    if (!nextName) return;

    setCatalog(current => sanitizePortfolioCatalogConfig({
      ...current,
      categories: [
        ...current.categories,
        {
          id: `category-${Date.now()}`,
          name: nextName,
          active: true,
          sort_order: (current.categories.length + 1) * 10
        }
      ]
    }));
    setNewCategoryName('');
  };

  const updateProduct = (productId: string, updates: Partial<PortfolioCatalogConfig['products'][number]>) => {
    setCatalog(current => sanitizePortfolioCatalogConfig({
      ...current,
      products: current.products.map(product =>
        product.id === productId ? { ...product, ...updates } : product
      )
    }));
  };

  const addProduct = () => {
    const nextName = newProduct.name.trim().toUpperCase();
    const nextCategory = newProduct.category.trim().toUpperCase();
    if (!nextName || !nextCategory) return;

    const aliases = newProduct.aliases
      .split(',')
      .map(alias => alias.trim().toUpperCase())
      .filter(Boolean);

    setCatalog(current => sanitizePortfolioCatalogConfig({
      ...current,
      products: [
        ...current.products,
        {
          id: `product-${Date.now()}`,
          name: nextName,
          category: nextCategory,
          aliases,
          active: true,
          sort_order: (current.products.length + 1) * 10
        }
      ]
    }));
    setNewProduct(createEmptyProductDraft());
  };

  const deactivateProduct = (productId: string) => {
    updateProduct(productId, { active: false });
  };

  const saveCatalog = async () => {
    setSaving(true);
    setFeedback('');
    try {
      const savedCatalog = await PortfolioCatalogService.saveCatalogConfig(catalog);
      setCatalog(savedCatalog);
      setFeedback('Catalogo salvo com sucesso.');
      onCatalogChangeRef.current?.(savedCatalog);
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao salvar o catalogo.');
    } finally {
      setSaving(false);
    }
  };

  const applyCatalog = async () => {
    setApplying(true);
    setFeedback('');
    try {
      const savedCatalog = await PortfolioCatalogService.saveCatalogConfig(catalog);
      const updatedClients = await PortfolioCatalogService.applyCatalogToAllClients(savedCatalog);
      setCatalog(savedCatalog);
      setFeedback(`Catalogo aplicado em ${updatedClients} cliente(s).`);
      onCatalogChangeRef.current?.(savedCatalog);
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao aplicar o catalogo na base.');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 rounded-[28px] border border-slate-200 bg-white flex items-center justify-center gap-3 text-slate-500">
        <Loader2 size={18} className="animate-spin" /> Carregando catalogo tecnico...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categorias</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{catalog.categories.length}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Produtos</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{catalog.products.length}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ativos</p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {catalog.products.filter(product => product.active).length}
          </p>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <section className="xl:w-[360px] space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <FolderTree size={16} className="text-cyan-600" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Categorias</h3>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={event => setNewCategoryName(event.target.value)}
              placeholder="Nova categoria"
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={addCategory}
              className="px-4 rounded-xl bg-cyan-600 text-white font-black text-[10px] uppercase tracking-widest"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-3">
            {catalog.categories.map(category => (
              <div key={category.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <input
                  type="text"
                  value={category.name}
                  onChange={event => updateCategory(category.id, { name: event.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-cyan-500"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {productCountByCategory.get(category.name) || 0} produto(s)
                  </span>
                  <button
                    type="button"
                    onClick={() => updateCategory(category.id, { active: !category.active })}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                      category.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {category.active ? 'Ativa' : 'Oculta'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex-1 space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Boxes size={16} className="text-blue-600" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Produtos do Catalogo</h3>
            </div>

            <div className="relative w-full lg:w-[320px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar produto ou categoria"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1.2fr_auto_auto] gap-3 items-end rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Produto</label>
              <input
                type="text"
                value={newProduct.name}
                onChange={event => setNewProduct(current => ({ ...current, name: event.target.value }))}
                placeholder="Novo produto"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoria</label>
              <select
                value={newProduct.category}
                onChange={event => setNewProduct(current => ({ ...current, category: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="">Selecione</option>
                {activeCategoryOptions.map(category => (
                  <option key={category.id} value={category.name}>{category.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aliases</label>
              <input
                type="text"
                value={newProduct.aliases}
                onChange={event => setNewProduct(current => ({ ...current, aliases: event.target.value }))}
                placeholder="Separar por virgula"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={addProduct}
              className="h-[46px] px-5 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {filteredProducts.map(product => (
              <div key={product.id} className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.9fr_1.1fr_auto_auto] gap-3 items-center rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <input
                  type="text"
                  value={product.name}
                  onChange={event => updateProduct(product.id, { name: event.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 outline-none focus:border-blue-500"
                />
                <select
                  value={product.category}
                  onChange={event => updateProduct(product.id, { category: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">Sem categoria</option>
                  {catalog.categories.map(category => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={product.aliases.join(', ')}
                  onChange={event => updateProduct(product.id, {
                    aliases: event.target.value
                      .split(',')
                      .map(alias => alias.trim().toUpperCase())
                      .filter(Boolean)
                  })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => updateProduct(product.id, { active: !product.active })}
                  className={`h-[46px] px-4 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    product.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {product.active ? 'Ativo' : 'Oculto'}
                </button>
                <button
                  type="button"
                  onClick={() => deactivateProduct(product.id)}
                  className="h-[46px] px-4 rounded-xl bg-rose-50 text-rose-600 border border-rose-100"
                  title="Ocultar produto"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            {filteredProducts.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-400">
                Nenhum produto encontrado para esse filtro.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-sm font-bold text-slate-500">
          {feedback || 'Salve o catalogo para manter as regras. Use aplicar para reclassificar a base inteira.'}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadCatalog}
            className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
          >
            <RefreshCcw size={14} /> Recarregar
          </button>
          <button
            type="button"
            onClick={saveCatalog}
            disabled={saving || applying}
            className="px-5 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar Catalogo
          </button>
          <button
            type="button"
            onClick={applyCatalog}
            disabled={saving || applying}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 disabled:opacity-60"
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            Aplicar na Base
          </button>
        </div>
      </div>
    </div>
  );
};
