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
  Database,
  X,
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
  const [totalFilas, setTotalFilas] = useState(0);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnio, setSelectedAnio] = useState('TODOS');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Métricas
  const [totalPatentamientos, setTotalPatentamientos] = useState(0);
  const [topMarca, setTopMarca] = useState({ nombre: '-', total: 0 });
  const [chartData, setChartData] = useState<{ marca: string; cantidad: number }[]>([]);
  const [aniosDisponibles, setAniosDisponibles] = useState<string[]>(['TODOS']);

  // Carga global de métricas (desde vistas)
  const loadGlobalMetrics = useCallback(async () => {
    setLoading(true);

    const { data: totalesData } = await supabase
      .from('vista_totales_anuales')
      .select('*')
      .order('anio', { ascending: false });

    if (totalesData && totalesData.length > 0) {
      const anios = totalesData.map((t: { anio: number }) => String(t.anio));
      setAniosDisponibles(['TODOS', ...anios]);

      if (selectedAnio === 'TODOS') {
        const sumaGlobal = totalesData.reduce(
          (acc: number, curr: { total_unidades: number }) => acc + Number(curr.total_unidades),
          0
        );
        setTotalPatentamientos(sumaGlobal);
      } else {
        const filaAnio = totalesData.find((t: { anio: number }) => String(t.anio) === selectedAnio);
        setTotalPatentamientos(filaAnio ? Number(filaAnio.total_unidades) : 0);
      }
    }

    let marcasQuery = supabase
      .from('vista_top_marcas')
      .select('marca, total_unidades')
      .order('total_unidades', { ascending: false });

    if (selectedAnio !== 'TODOS') {
      marcasQuery = marcasQuery.eq('anio', Number(selectedAnio));
    }

    const { data: marcasData } = await marcasQuery.limit(500);

    if (marcasData && marcasData.length > 0) {
      const agrupado: Record<string, number> = {};
      marcasData.forEach((m: { marca: string; total_unidades: number }) => {
        agrupado[m.marca] = (agrupado[m.marca] || 0) + Number(m.total_unidades);
      });

      const sorted = Object.entries(agrupado)
        .map(([marca, cantidad]) => ({ marca, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      if (sorted.length > 0) {
        setTopMarca({ nombre: sorted[0].marca, total: sorted[0].cantidad });
        setChartData(sorted.slice(0, 10));
      }
    }

    setLoading(false);
  }, [selectedAnio]);

  // Carga de la tabla paginada con conteo estimado para evitar timeouts
  const loadTableData = useCallback(async () => {
    setTableLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('patentamientos_resumen')
      .select('*', { count: 'estimated' });

    if (selectedAnio !== 'TODOS') {
      query = query.eq('anio', Number(selectedAnio));
    }

    const cleaned = searchTerm.trim();
    if (cleaned.length > 0) {
      query = query.or(`marca.ilike.%${cleaned}%,modelo.ilike.%${cleaned}%`);
    }

    query = query.order('cantidad', { ascending: false }).range(from, to);

    const { data: rows, count, error } = await query;

    if (error) {
      console.error('Error en búsqueda:', error.message);
      setTableData([]);
      setTotalFilas(0);
    } else if (rows) {
      setTableData(rows);
      setTotalFilas(count || rows.length);
    }

    setTableLoading(false);
  }, [selectedAnio, searchTerm, currentPage]);

  useEffect(() => {
    loadGlobalMetrics();
  }, [loadGlobalMetrics]);

  useEffect(() => {
    const handler = setTimeout(() => {
      loadTableData();
    }, 300);
    return () => clearTimeout(handler);
  }, [loadTableData]);

  const totalPages = Math.ceil(totalFilas / pageSize) || 1;

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
            Parque automotor 0km en Argentina — Registro oficial DNRPA (2018–2026)
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
            <span className="text-sm font-medium">Patentamientos Totales</span>
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {loading ? '...' : totalPatentamientos.toLocaleString('es-AR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">
            {selectedAnio === 'TODOS' ? 'Autos registrados (2018–2026)' : `Autos año ${selectedAnio}`}
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
            <Database className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {tableLoading ? '...' : totalFilas.toLocaleString('es-AR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Combinaciones estimadas</span>
        </div>
      </section>

      {/* Buscador y Selector */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Buscar Marca o Modelo
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Ej: Hilux, Cronos, 208, Corolla, Amarok..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Seleccionar Año</label>
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
                  {a === 'TODOS' ? 'Todos los años (2018–2026)' : a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Gráfico Top 10 */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Top 10 Marcas ({selectedAnio === 'TODOS' ? 'Histórico 2018–2026' : selectedAnio})
        </h2>
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

      {/* Tabla Paginada */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Detalle de Patentamientos</h2>
          <span className="text-xs text-slate-400">
            Página {currentPage} de {totalPages}
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
                    Buscando en la base de datos...
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
                    No se encontraron registros para &quot;{searchTerm}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>{totalFilas.toLocaleString('es-AR')} combinaciones encontradas</span>
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
