import React from 'react';
import { Tag as TagIcon } from 'lucide-react';
import type { PortfolioCategoryGroup } from '../utils/clientPortfolio';

type BrowserTheme = 'light' | 'dark';

interface PortfolioCategoryBrowserProps {
  title: string;
  description?: string;
  groups: PortfolioCategoryGroup[];
  expandedCategory: string | null;
  onToggleCategory: (category: string) => void;
  emptyCategoryLabel: string;
  emptySelectionLabel: string;
  theme?: BrowserTheme;
}

const THEME_STYLES: Record<
  BrowserTheme,
  {
    title: string;
    description: string;
    icon: string;
    categoryIdle: string;
    categoryActive: string;
    detailCard: string;
    detailLabel: string;
    detailTitle: string;
    totalBadge: string;
    profileBadge: string;
    productCard: string;
    productName: string;
    quantityLabel: string;
    quantityValue: string;
    emptyState: string;
  }
> = {
  light: {
    title: 'text-slate-400 border-slate-100',
    description: 'text-slate-400',
    icon: 'text-cyan-500',
    categoryIdle: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
    categoryActive: 'bg-slate-900 text-white border-slate-900 shadow-sm',
    detailCard: 'border-slate-200 bg-slate-50',
    detailLabel: 'text-slate-400',
    detailTitle: 'text-slate-800',
    totalBadge: 'bg-white text-slate-600 border-slate-200',
    profileBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    productCard: 'border-slate-200 bg-white',
    productName: 'text-slate-800',
    quantityLabel: 'text-slate-400',
    quantityValue: 'text-slate-900',
    emptyState: 'border-slate-200 bg-slate-50 text-slate-400'
  },
  dark: {
    title: 'text-slate-500 border-slate-800',
    description: 'text-slate-500',
    icon: 'text-cyan-300',
    categoryIdle: 'bg-cyan-950/30 text-cyan-200 border-cyan-800/60 hover:bg-cyan-900/40',
    categoryActive: 'bg-white text-slate-900 border-white shadow-sm',
    detailCard: 'border-slate-700 bg-slate-800/55',
    detailLabel: 'text-slate-500',
    detailTitle: 'text-white',
    totalBadge: 'bg-slate-900 text-slate-200 border-slate-700',
    profileBadge: 'bg-amber-950/35 text-amber-200 border-amber-800/60',
    productCard: 'border-slate-700 bg-slate-900/75',
    productName: 'text-slate-100',
    quantityLabel: 'text-slate-500',
    quantityValue: 'text-white',
    emptyState: 'border-slate-700 bg-slate-800/30 text-slate-500'
  }
};

export const PortfolioCategoryBrowser: React.FC<PortfolioCategoryBrowserProps> = ({
  title,
  description,
  groups,
  expandedCategory,
  onToggleCategory,
  emptyCategoryLabel,
  emptySelectionLabel,
  theme = 'light'
}) => {
  const styles = THEME_STYLES[theme];
  const selectedGroup = groups.find(group => group.category === expandedCategory) || null;

  return (
    <div className="space-y-4">
      <div className={`border-b pb-2 ${styles.title}`}>
        <h5 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
          <TagIcon size={14} className={styles.icon} /> {title}
        </h5>
        {description && (
          <p className={`mt-2 text-xs font-bold ${styles.description}`}>{description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {groups.length > 0 ? groups.map((group, groupIndex) => {
          const isExpanded = expandedCategory === group.category;

          return (
            <button
              key={`portfolio-category-${group.category}-${group.total_quantity}-${groupIndex}`}
              type="button"
              onClick={() => onToggleCategory(group.category)}
              className={`px-4 py-2.5 rounded-2xl border text-xs font-black uppercase tracking-wide transition-all ${
                isExpanded ? styles.categoryActive : styles.categoryIdle
              }`}
            >
              {group.category}
            </button>
          );
        }) : (
          <span className="text-xs font-bold text-slate-400 italic">{emptyCategoryLabel}</span>
        )}
      </div>

      {selectedGroup ? (
        <div className={`rounded-[28px] border p-5 space-y-4 ${styles.detailCard}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${styles.detailLabel}`}>Categoria Selecionada</p>
                <h6 className={`text-lg font-black mt-1 ${styles.detailTitle}`}>{selectedGroup.category}</h6>
              </div>

              {selectedGroup.profiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedGroup.profiles.map((profile, profileIndex) => (
                    <span
                      key={`portfolio-profile-${selectedGroup.category}-${profile}-${profileIndex}`}
                      className={`px-3 py-1 rounded-xl border text-[10px] font-black uppercase ${styles.profileBadge}`}
                    >
                      {profile}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <span className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase shrink-0 ${styles.totalBadge}`}>
              {selectedGroup.total_quantity} item(ns)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {selectedGroup.equipments.map((equipment, equipmentIndex) => (
              <div
                key={`portfolio-equipment-${selectedGroup.category}-${equipment.name}-${equipment.quantity}-${equipmentIndex}`}
                className={`rounded-2xl border p-4 ${styles.productCard}`}
              >
                <p className={`text-sm font-black leading-tight ${styles.productName}`}>{equipment.name}</p>
                <p className={`text-[10px] font-black uppercase tracking-widest mt-3 ${styles.quantityLabel}`}>Quantidade</p>
                <p className={`text-2xl font-black mt-1 ${styles.quantityValue}`}>{equipment.quantity}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`rounded-[28px] border border-dashed px-5 py-8 text-center text-sm font-bold ${styles.emptyState}`}>
          {emptySelectionLabel}
        </div>
      )}
    </div>
  );
};
