
import React, { useState, useEffect } from 'react';
import {
    X, Search, MapPin, Navigation, AlertTriangle, CheckCircle2,
    ArrowRight, Loader2
} from 'lucide-react';
import { scraperService, ScraperProcess } from '../../services/scraperService';
import { dataService } from '../../services/dataService';

interface ProcessFormProps {
    onClose: () => void;
    onSuccess: () => void;
    user: any;
}

export const ProcessForm: React.FC<ProcessFormProps> = ({ onClose, onSuccess, user }) => {
    const [step, setStep] = useState(1); // 1: Input, 2: Confirm
    const [isLoading, setIsLoading] = useState(false);

    // Form Data
    const [name, setName] = useState('');
    const [keyword, setKeyword] = useState('');
    const [locationInput, setLocationInput] = useState('');
    const [radius, setRadius] = useState(2);
    const [gridSize, setGridSize] = useState(1);

    // Verification Data
    const [resolvedLocation, setResolvedLocation] = useState<any>(null);
    const [mapUrl, setMapUrl] = useState('');


    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!keyword || !locationInput) return;

        setIsLoading(true);
        try {
            // 1. Fetch Key from DB
            const GOOGLE_MAPS_KEY = await dataService.getSystemSetting('GOOGLE_MAPS_KEY');
            if (!GOOGLE_MAPS_KEY) {
                throw new Error("Chave do Google Maps não configurada no Módulo de Gestão.");
            }

            // 2. Verify Location directly using Frontend API Call via Proxy
            const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationInput)}&key=${GOOGLE_MAPS_KEY}`;
            const url = `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status !== 'OK') {
                throw new Error(data.error_message || data.status);
            }

            const result = data.results[0];
            const resolvedData = {
                formatted_address: result.formatted_address,
                location: result.geometry.location,
                place_id: result.place_id
            };

            setResolvedLocation(resolvedData);

            // 2. Generate Map URL 
            const lat = resolvedData.location.lat;
            const lng = resolvedData.location.lng;
            setMapUrl(`https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed`);

            setStep(2);
        } catch (error: any) {
            alert(`Erro ao verificar local pelo Google: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await scraperService.saveProcess({
                name: name || `${keyword} em ${locationInput}`,
                keyword,
                location_input: locationInput,
                radius_km: radius,
                grid_size: gridSize,
                resolved_address: resolvedLocation.formatted_address,
                resolved_lat: resolvedLocation.location.lat,
                resolved_lng: resolvedLocation.location.lng,
                status: 'ACTIVE'
            });
            onSuccess();
        } catch (error: any) {
            alert(`Erro ao salvar: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* HEAD */}
                <div className="bg-slate-50 p-6 flex justify-between items-center border-b border-slate-100">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Novo Processo de Captação</h3>
                        <div className="flex gap-2 mt-2">
                            <span className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                            <span className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm">
                        <X size={20} />
                    </button>
                </div>

                {/* BODY */}
                <div className="p-8 overflow-y-auto">
                    {step === 1 && (
                        <form onSubmit={handleVerify} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">O que buscar?</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
                                    <input
                                        value={keyword}
                                        onChange={e => setKeyword(e.target.value)}
                                        placeholder="Ex: Pizzaria, Escola, Concessionária..."
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        autoFocus
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1 pl-1">Palavra-chave principal para o Google Maps.</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Onde buscar?</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-3.5 text-slate-400" size={20} />
                                    <input
                                        value={locationInput}
                                        onChange={e => setLocationInput(e.target.value)}
                                        placeholder="Ex: Centro de Campinas, Moema SP..."
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1 pl-1">Digite o bairro, cidade ou região de forma natural.</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Nome do Processo (Opcional)</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ex: Captação Pizzarias Campinas Agosto"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={!keyword || !locationInput || isLoading}
                                className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                {isLoading ? <Loader2 className="animate-spin" /> : <Navigation size={20} />}
                                Verificar Localização
                            </button>
                        </form>
                    )}

                    {step === 2 && resolvedLocation && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">

                            {/* Confirmation Banner */}
                            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-4">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div>
                                    <h4 className="font-black text-emerald-800 text-lg">Local Encontrado!</h4>
                                    <p className="text-emerald-700 font-medium text-sm mt-1">{resolvedLocation.formatted_address}</p>
                                    <p className="text-xs text-emerald-600 mt-2 bg-emerald-100/50 px-2 py-1 rounded inline-block">
                                        Lat: {resolvedLocation.location.lat.toFixed(5)}, Lng: {resolvedLocation.location.lng.toFixed(5)}
                                    </p>
                                </div>
                            </div>

                            {/* Radius Selector */}
                            <div className="space-y-4">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex justify-between">
                                    <span>Raio de Busca</span>
                                    <span className="text-blue-600">{radius} km</span>
                                </label>
                                <input
                                    type="range"
                                    min="1" max="20" step="1"
                                    value={radius}
                                    onChange={e => setRadius(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-xs font-bold text-slate-400 px-1">
                                    <span>Bairro (1km)</span>
                                    <span>Cidade (10km)</span>
                                    <span>Região (20km)</span>
                                </div>
                                <p className="text-xs text-slate-500 text-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    Estimativa: <strong>{(Math.PI * radius * radius).toFixed(1)} km²</strong> de área de cobertura.
                                    {radius > 10 && <span className="block text-orange-500 mt-1 font-bold">⚠️ Atenção: Raios grandes podem demorar e custar mais.</span>}
                                </p>

                            </div>

                            {/* Grid Size Selector */}
                            <div className="space-y-4">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex justify-between">
                                    <span>Tamanho do Grid</span>
                                    <span className="text-blue-600">{gridSize}x{gridSize} ({gridSize * gridSize} pontos)</span>
                                </label>
                                <input
                                    type="range"
                                    min="1" max="5" step="2"
                                    value={gridSize}
                                    onChange={e => setGridSize(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-xs font-bold text-slate-400 px-1">
                                    <span>1x1 (Rápido)</span>
                                    <span>3x3 (Médio)</span>
                                    <span>5x5 (Detalhado)</span>
                                </div>
                            </div>

                            {/* Map Preview */}
                            <div className="rounded-2xl overflow-hidden border border-slate-200 h-48 relative bg-slate-100">
                                <iframe
                                    width="100%"
                                    height="100%"
                                    frameBorder="0"
                                    scrolling="no"
                                    marginHeight={0}
                                    marginWidth={0}
                                    src={mapUrl}
                                    className="opacity-75 hover:opacity-100 transition-opacity"
                                ></iframe>
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-4 h-4 bg-blue-600 rounded-full ring-4 ring-blue-600/30 shadow-xl animate-pulse"></div>
                                </div>
                                <div className="absolute bottom-2 right-2 bg-white/90 px-2 py-1 rounded text-[10px] font-bold text-slate-500 shadow-sm pointer-events-none">
                                    Visualização Aproximada
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase tracking-wider hover:bg-slate-200 transition-colors"
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                                    Confirmar e Salvar
                                </button>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
