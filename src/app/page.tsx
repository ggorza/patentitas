'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Car,
  Award,
  Layers,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
} from 'lucide-react';

interface Registro {
  id?: number;
  anio: number;
  mes: number;
  marca: string;
  modelo: string;
  origen: string;
  provincia: string;
  cantidad: number;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableData, setTableData] = useState<Registro[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnio, setSelectedAnio] = useState('TODOS');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Métricas agregadas
  const [totalPatentamientos, setTotalPatentamientos] = useState(0);
  const [topMarca, setTopMarca] = useState({ nombre: '-', total: 0 });
  const [chartData, setChartData] = useState<{ marca: string; cantidad: number }[]>([]);
  const [aniosDisponibles, setAniosDisponibles] = useState<string[]>(['TODOS']);

  // Cargar métricas globales y gráfico (desde la vista liviana)
  const loadGlobalMetrics = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('vista_metricas_anuales').select('anio, marca, total_unidades').limit(10000);

    if (selectedAnio !== 'TODOS') {
      query = query.eq('anio', Number(selectedAnio));
    }

    const { data: rows, error } = await query;

    if (!error && rows) {
      let total = 0;
      const porMarca: Record<string, number> = {};
      const aniosSet = new Set<number>();

      rows.forEach((r: { anio: number; marca: string; total_unidades: number }) => {
        total += r.total_unidades;
        aniosSet.add(r.anio);
        porMarca[r.marca] = (porMarca[r.marca] || 0) + r.total_unidades;
      });

      setTotalPatentamientos(total);

      // Anios disponibles
      const sortedAnios = Array.from(aniosSet).sort((a, b) => b - a).map(String);
      setAniosDisponibles(['TODOS', ...sortedAnios]);

      // Top 10 marcas
      const sortedMarcas = Object.entries(porMarca)
        .map(([marca, cantidad]) => ({ marca, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      if (sortedMarcas.length > 0) {
        setTopMarca({ nombre: sortedMarcas[0].marca, total: sortedMarcas[0].cantidad });
        setChartData(sortedMarcas.slice(0, 10));
      }
    }
    setLoading(false);
  }, [selectedAnio]);

  // Cargar tabla con paginación directa en Supabase (solo 12 filas por request)
  const loadTableData = useCallback(async () => {
    setTableLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('patentamientos_resumen')
      .select('*', { count: 'exact' });

    if (selectedAnio !== 'TODOS') {
      query = query.eq('anio', Number(selectedAnio));
    }

    if (searchTerm.trim() !== '') {
      const term = `%${searchTerm.trim().toUpperCase()}%`;
      query = query.or(`marca.ilike.${term},modelo.ilike.${term}`);
    }

    query = query.order('cantidad', { ascending: false }).range(from, to);

    const { data: rows, count, error } = await query;

    if (!error && rows) {
      setTableData(rows);
      setTotalCount(count || 0);
    }
    setTableLoading(false);
  }, [selectedAnio, searchTerm, currentPage]);

  useEffect(() => {
    loadGlobalMetrics();
  }, [loadGlobalMetrics]);

  useEffect(() => {
    loadTableData();
  }, [loadTableData]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <Car className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Patentitas</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Análisis de patentamientos 0km en Argentina (DNRPA Datos Abiertos)
          </p>
        </div>
        <button
          onClick={() => {
            loadGlobalMetrics();
            loadTableData();
          }}
          disabled={loading || tableLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading || tableLoading ? 'animate-spin' : ''}`} />
          Refrescar
        </button>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Patentamientos Registrados</span>
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {loading ? '...' : totalPatentamientos.toLocaleString('es-AR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">
            {selectedAnio === 'TODOS' ? 'Histórico acumulado' : `Año ${selectedAnio}`}
          </span>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Marca Más Vendida</span>
            <Award className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white mt-2 truncate">
            {loading ? '...' : topMarca.nombre}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">
            {loading ? '...' : `${topMarca.total.toLocaleString('es-AR')} unidades`}
          </span>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Coincidencias en Búsqueda</span>
            <Search className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {tableLoading ? '...' : totalCount.toLocaleString('es-AR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Grupos de registros encontrados</span>
        </div>
      </section>

      {/* Controles y Búsqueda */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Buscar Marca o Modelo
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Ej: Toyota, Cronos, 208, Hilux..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Filtrar Año</label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <select
              value={selectedAnio}
              onChange={(e) => {
                setSelectedAnio(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>
                  {a === 'TODOS' ? 'Todos los años' : a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Gráfico Top 10 */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Top 10 Marcas ({selectedAnio === 'TODOS' ? 'Histórico' : selectedAnio})</h2>
        <div className="h-72 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="marca" stroke="#94a3b8" fontSize={11} interval={0} angle={-25} textAnchor="end" />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }}
                  itemStyle={{ color: '#60a5fa' }}
                />
                <Bar dataKey="cantidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Sin datos para graficar.
            </div>
          )}
        </div>
      </section>

      {/* Tabla con paginación remota */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Detalle de Patentamientos</h2>
          <span className="text-xs text-slate-400">
            Página {currentPage} de {totalPages} ({totalCount} filas)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Provincia</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tableLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Cargando página...
                  </td>
                </tr>
              ) : tableData.length > 0 ? (
                tableData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-slate-400">{row.mes}/{row.anio}</td>
                    <td className="px-4 py-3 font-medium text-white">{row.marca}</td>
                    <td className="px-4 py-3">{row.modelo}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                        {row.origen}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.provincia}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-400">
                      {row.cantidad.toLocaleString('es-AR')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron registros coincidentes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>{totalCount.toLocaleString('es-AR')} resultados en total</span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || tableLoading}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || tableLoading}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
