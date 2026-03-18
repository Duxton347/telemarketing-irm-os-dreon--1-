import React, { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

interface AutocompleteInputProps {
    value: string;
    onChange: (val: string) => void;
    options: { id: string | number; label: string }[];
    placeholder?: string;
    required?: boolean;
    className?: string;
    icon?: React.ReactNode;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
    value, onChange, options, placeholder, required, className, icon
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes((value || '').toLowerCase())
    ).slice(0, 50); // Limit to 50 for performance

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative group">
                {icon && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                        {icon}
                    </div>
                )}
                <input
                    required={required}
                    type="text"
                    value={value || ''}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    className={className || `w-full ${icon ? 'pl-12' : 'px-4'} pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 focus:bg-white rounded-xl outline-none transition-all font-medium text-slate-700 placeholder:text-slate-400 shadow-inner`}
                    placeholder={placeholder}
                />
            </div>

            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                    {filteredOptions.map((opt, index) => (
                        <div
                            key={index}
                            className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0 text-sm font-bold text-slate-700"
                            onClick={() => {
                                onChange(opt.label);
                                setIsOpen(false);
                            }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}

            {isOpen && filteredOptions.length === 0 && value && (
                 <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl px-4 py-3 text-sm text-slate-400 font-medium">
                     Nenhum resultado. Pressione Enter ou clique fora para adicionar como novo.
                 </div>
            )}
        </div>
    );
};
