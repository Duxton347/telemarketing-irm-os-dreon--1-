import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Visit } from '../types';

export const exportToPDF = (visits: Visit[], title: string) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = visits.map((v, i) => [
        i + 1,
        v.clientName,
        v.contactPerson || '-',
        v.address || 'Endereço não informado',
        v.phone || '-',
        v.externalSalesperson || '-',
        new Date(v.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        v.notes || '-'
    ]);

    autoTable(doc, {
        startY: 35,
        head: [['#', 'Cliente', 'Responsável', 'Endereço', 'Telefone', 'Vendedor', 'Horário', 'Observação']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 163, 74] }, // Green-600
    });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
};

export const exportToExcel = (visits: Visit[], title: string) => {
    const data = visits.map((v, i) => ({
        'Ordem': i + 1,
        'Cliente': v.clientName,
        'Responsável': v.contactPerson || '',
        'Endereço': v.address,
        'Telefone': v.phone,
        'Vendedor Externo': v.externalSalesperson,
        'Data/Hora': new Date(v.scheduledDate).toLocaleString(),
        'Indicação': v.isIndication ? 'Sim' : 'Não',
        'Observação': v.notes || '',
        'Status': v.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rota");
    XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_')}.xlsx`);
};
