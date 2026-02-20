import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Visit } from '../types';

export const exportToPDF = (visits: Visit[], baseTitle: string) => {
    const doc = new jsPDF('landscape'); // Use landscape to fit 'Observação' and 'Data'

    // Extract salesperson and date from the first visit if available
    const salesperson = visits.length > 0 && visits[0].externalSalesperson ? visits[0].externalSalesperson : 'Vendedor Indefinido';
    const scheduledDate = visits.length > 0 ? new Date(visits[0].scheduledDate).toLocaleDateString() : new Date().toLocaleDateString();

    // "mudar o titulo para roteiro e o nome do vendedor e a data que estivesse agendado"
    const title = `Roteiro - ${salesperson} - ${scheduledDate}`;

    doc.setFontSize(16);
    doc.text(title, 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = visits.map((v, i) => [
        i + 1,
        v.clientName,
        v.contactPerson || '-',
        v.address || 'Endereço não informado',
        v.phone || '-',
        // "tambem no relatório exportação em pdf aparecesse a data da visita"
        new Date(v.scheduledDate).toLocaleDateString(),
        new Date(v.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        // "fizesse aparecer as observações da parte de roteiro apareça para o vendedor"
        v.notes || '-'
    ]);

    autoTable(doc, {
        startY: 35,
        head: [['#', 'Cliente', 'Responsável', 'Endereço', 'Telefone', 'Data', 'Horário', 'Observação']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 163, 74] }, // Green-600
        columnStyles: {
            7: { cellWidth: 50 } // Give Observation column a bit more width in landscape
        }
    });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
};

export const exportToExcel = (visits: Visit[], baseTitle: string) => {
    const salesperson = visits.length > 0 && visits[0].externalSalesperson ? visits[0].externalSalesperson : 'Vendedor Indefinido';
    const scheduledDate = visits.length > 0 ? new Date(visits[0].scheduledDate).toLocaleDateString() : new Date().toLocaleDateString();
    const title = `Roteiro_${salesperson}_${scheduledDate}`.replace(/\s+/g, '_').replace(/\//g, '-');

    const data = visits.map((v, i) => ({
        'Ordem': i + 1,
        'Cliente': v.clientName,
        'Responsável': v.contactPerson || '',
        'Endereço': v.address,
        'Telefone': v.phone,
        'Vendedor Externo': v.externalSalesperson,
        'Data Agendada': new Date(v.scheduledDate).toLocaleDateString(),
        'Horário': new Date(v.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        'Indicação': v.isIndication ? 'Sim' : 'Não',
        'Observação': v.notes || '',
        'Status': v.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rota");
    XLSX.writeFile(workbook, `${title}.xlsx`);
};
