import * as XLSX from 'xlsx';
import type { ScraperResult } from '../services/scraperService';

type ScraperExportOptions = {
    status?: string;
    runLabel?: string;
    cityFilter?: string;
};

const sanitizeFilePart = (value?: string) => {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'resultados';
};

const formatTimestamp = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
};

export const exportScraperResultsToExcel = (
    results: ScraperResult[],
    options: ScraperExportOptions = {}
) => {
    const rows = results.map(result => ({
        Nome: result.name || '',
        Numero: result.phone || '',
        Site: result.website || '',
        Endereco: result.address || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
        { wch: 32 },
        { wch: 22 },
        { wch: 38 },
        { wch: 52 }
    ];

    if (worksheet['!ref']) {
        worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

    const fileName = [
        'scraper',
        sanitizeFilePart(options.runLabel || options.status),
        sanitizeFilePart(options.cityFilter),
        formatTimestamp(new Date())
    ].join('_') + '.xlsx';

    XLSX.writeFile(workbook, fileName);

    return {
        count: rows.length,
        fileName
    };
};
