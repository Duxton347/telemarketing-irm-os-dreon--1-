import React, { useState, useRef } from 'react';
import { SmartImportService } from '../services/smartImportService';
import { dataService } from '../services/dataService';
import { Client } from '../types';
import { Upload, AlertTriangle, CheckCircle, FileSpreadsheet, X } from 'lucide-react';

interface SmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SmartImportModal: React.FC<SmartImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ new: number, updated: number, errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStats(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setStats(null);
    try {
      const rawData = await SmartImportService.parseExcel(file);
      if (!rawData || rawData.length === 0) throw new Error("Planilha vazia");

      const headers = Object.keys(rawData[0]);
      console.log('Headers Importados:', headers);
      const mapping = SmartImportService.detectColumnMapping(headers);
      
      const existingClients = await dataService.getClients();
      
      const result = await SmartImportService.processImport(rawData, mapping, existingClients);

      // Save to database
      if (result.toInsert.length > 0) {
        for (const client of result.toInsert) {
           await dataService.upsertClient(client as any);
        }
      }

        for (const update of result.toUpdate) {
           if (update.id) {
               await dataService.updateClientFields(update.id, update);
           }
        }

      setStats(result.stats);
      if (result.stats.errors === 0 || (result.stats.new > 0 || result.stats.updated > 0)) {
          setTimeout(() => {
              onSuccess();
              onClose();
          }, 4000);
      }
    } catch (e: any) {
      alert("Erro ao importar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileSpreadsheet className="text-green-600" />
            Importação Inteligente
        </h2>

        {!stats ? (
             <div className="space-y-4">
               <p className="text-sm text-gray-600">
                   Envie uma planilha (Excel ou CSV) com os dados dos seus clientes. O sistema mapeará as colunas de "Nome", "Telefone", "E-mail" e Endereço automaticamente.
               </p>
               
               <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => fileInputRef.current?.click()}>
                 
                 <Upload size={32} className="text-blue-500 mb-2" />
                 <span className="text-sm font-medium text-gray-700">
                     {file ? file.name : 'Clique para selecionar o arquivo (.xlsx, .csv)'}
                 </span>
                 <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                    onChange={handleFileChange} 
                />
               </div>

               <button 
                className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md py-2 px-4 font-medium transition-colors" 
                disabled={!file || loading}
                onClick={handleImport}>
                   {loading ? 'Processando (aguarde)...' : 'Iniciar Importação'}
               </button>
             </div>
        ) : (
            <div className="space-y-4 text-center py-6">
                <CheckCircle size={48} className="text-green-500 mx-auto" />
                <h3 className="text-lg font-bold">Importação Concluída</h3>
                <div className="flex justify-center gap-6 mt-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
                        <div className="text-xs text-gray-500">Novos</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.updated}</div>
                        <div className="text-xs text-gray-500">Atualizados</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
                        <div className="text-xs text-gray-500">Erros/Ignorados</div>
                    </div>
                </div>
                {stats.errors > 0 && (
                    <p className="text-xs text-red-500 mt-2 flex items-center justify-center gap-1">
                        <AlertTriangle size={12} /> Algumas linhas não tinham telefone válido.
                    </p>
                )}
            </div>
        )}
      </div>
    </div>
  );
};
