import React, { useState, useEffect } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
    value: number | string;
    onChange: (value: number) => void;
}

export function CurrencyInput({ value, onChange, ...props }: CurrencyInputProps) {
    const [displayValue, setDisplayValue] = useState('');

    const parseCurrency = (val: string) => {
        if (!val) return 0;
        const digits = val.replace(/\D/g, '');
        return Number(digits) / 100;
    };

    useEffect(() => {
        const numValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : (value || 0);

        if (numValue === 0 && (!displayValue || parseCurrency(displayValue) === 0)) {
            if (!displayValue) {
                setDisplayValue('');
            }
        } else if (numValue !== undefined && numValue !== null && !isNaN(numValue)) {
            const formatted = new Intl.NumberFormat('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(numValue);

            if (parseCurrency(displayValue) !== numValue) {
                 setDisplayValue(formatted);
            }
        } else {
            setDisplayValue('');
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const digits = rawValue.replace(/\D/g, '');

        if (!digits) {
            setDisplayValue('');
            onChange(0);
            return;
        }

        const numValue = Number(digits) / 100;

        const formatted = new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numValue);

        setDisplayValue(formatted);
        onChange(numValue);
    };

    return (
        <input
            {...props}
            type="text"
            value={displayValue}
            onChange={handleChange}
        />
    );
}
