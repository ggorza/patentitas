'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
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

type SortColumn = 'periodo' | 'marca' | 'modelo' | 'origen' | 'provincia' | 'cantidad';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableData, setTableData] = useState<Registro[]>([]);
  const [totalFilas, setTotalFilas] = useState(0);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnio, setSelectedAnio] = useState('TODOS');
  const [selectedProvincia, setSelectedProvincia] = useState('TODAS');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Ordenamiento
  const [sortColumn, setSortColumn] = useState<SortColumn>('cantidad');
  const [sortAscending, setSortAscending] = useState(false);

  // Opciones de selector
  const [aniosDisponibles, setAniosDisponibles] = useState<string[]>(['TODOS']);
  const [provinciasDisponibles, setProvinciasDisponibles] = useState<string[]>(['TODAS']);

  // Métricas y gráficos
  const [totalPatentamientos, setTotalPatentamientos] = useState(0);
  const [topMarca, setTopMarca] = useState({ nombre: '-', total: 0 });
  const [barChartData, setBarChartData] = useState<{ marca: string; cantidad: number }[]>([]);
  const [lineChartData, setLineChartData] = useState<{ anio: number; cantidad: number }[]>([]);

  // 1. Cargar opciones iniciales (años y provincias)
  useEffect(() => {
    async function initOptions() {
      const [aniosRes, provsRes] = await Promise.all([
        supabase.from('vista_totales_anuales').select('anio').order('anio', { ascending: false }),
        supabase.from('vista_provincias').select('provincia'),
      ]);

      if (aniosRes.data) {
        setAniosDisponibles(['TODOS', ...aniosRes.data.map((t: { anio: number }) => String(t.anio))]);
      }

      if (provsRes.data) {
        setProvinciasDisponibles(['TODAS', ...provsRes.data.map((p: { provincia: string }) => p.provincia)]);
      }
    }
    initOptions();
  }, []);

  // 2. Cargar KPIs y Gráficos mediante función RPC de Supabase (sin recortes)
  const loadMetricsAndCharts = useCallback(async () => {
    setLoading(true);

    const { data: rows, error } = await supabase.rpc('obtener_metricas_filtradas', {
      p_anio: selectedAnio === 'TODOS' ? null : Number(selectedAnio),
      p_provincia: selectedProvincia === 'TODAS' ? null : selectedProvincia,
      p_search: searchTerm.trim() === '' ? null : searchTerm.trim(),
    });

    if (!error && rows && rows.length > 0) {
      let total = 0;
      const porMarca: Record<string, number> = {};
      const porAnio: Record<number, number> = {};

      rows.forEach((r: { anio: number; marca: string; total_unidades: number }) => {
        const qty = Number(r.total_unidades);
        total += qty;
        porMarca[r.marca] = (porMarca[r.marca] || 0) + qty;
        porAnio[r.anio] = (porAnio[r.anio] || 0) + qty;
      });

      setTotalPatentamientos(total);

      // Top Marcas
      const sortedMarcas = Object.entries(porMarca)
        .map(([marca, cantidad]) => ({ marca, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      setTopMarca({
        nombre: sortedMarcas[0]?.marca || '-',
        total: sortedMarcas[0]?.cantidad || 0,
      });
      setBarChartData(sortedMarcas.slice(0, 10));

      // Evolución interanual completa
      const sortedAnios = Object.entries(porAnio)
        .map(([anio, cantidad]) => ({ anio: Number(anio), cantidad }))
        .sort((a, b) => a.anio - b.anio);

      setLineChartData(sortedAnios);
    } else {
      setTotalPatentamientos(0);
      setTopMarca({ nombre: '-', total: 0 });
      setBarChartData([]);
      setLineChartData([]);
    }

    setLoading(false);
  }, [selectedAnio, selectedProvincia, searchTerm]);

  // 3. Cargar tabla paginada con ordenamiento
  const loadTableData = useCallback(async () => {
    setTableLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from('patentamientos_resumen').select('*', { count: 'estimated' });

    if (selectedAnio !== 'TODOS') query = query.eq('anio', Number(selectedAnio));
    if (selectedProvincia !== 'TODAS') query = query.eq('provincia', selectedProvincia);

    const cleaned = searchTerm.trim();
    if (cleaned.length > 0) {
      query = query.or(`marca.ilike.%${cleaned}%,modelo.ilike.%${cleaned}%`);
    }

    if (sortColumn === 'periodo') {
      query = query
        .order('anio', { ascending: sortAscending })
        .order('mes', { ascending: sortAscending });
    } else {
      query = query.order(sortColumn, { ascending: sortAscending });
    }

    query = query.range(from, to);

    const { data: rows, count, error } = await query;

    if (!error && rows) {
      setTableData(rows);
      setTotalFilas(count || rows.length);
    } else {
      setTableData([]);
      setTotalFilas(0);
    }

    setTableLoading(false);
  }, [selectedAnio, selectedProvincia, searchTerm, currentPage, sortColumn, sortAscending]);

  useEffect(() => {
    const handler = setTimeout(() => {
      loadMetricsAndCharts();
      loadTableData();
    }, 250);
    return () => clearTimeout(handler);
  }, [loadMetricsAndCharts, loadTableData]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortAscending(!sortAscending);
    } else {
      setSortColumn(column);
      setSortAscending(column === 'marca' || column === 'modelo' || column === 'provincia' || column === 'origen');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition" />;
    }
    return sortAscending ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
    );
  };

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
            loadMetricsAndCharts();
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
          <span className="text-xs text-slate-500 mt-1 block">Unidades reales bajo filtro actual</span>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Marca Líder</span>
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
            <span className="text-sm font-medium">Coincidencias en Base</span>
            <Database className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {tableLoading ? '...' : totalFilas.toLocaleString('es-AR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Lotes de registros encontrados</span>
        </div>
      </section>

      {/* Filtros: Texto, Año y Provincia */}
      <section className="bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Buscar Marca o Modelo
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Ej: Hilux, Cronos, Renegade, 208..."
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
            <label className="block text-xs font-semibold text-slate-400 mb-1">Filtrar por Año</label>
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

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Filtrar por Provincia</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={selectedProvincia}
                onChange={(e) => {
                  setSelectedProvincia(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 truncate"
              >
                {provinciasDisponibles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Gráficos */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top Marcas</h2>
          <div className="h-72 w-full">
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
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
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Evolución Anual (Unidades)</h2>
          <div className="h-72 w-full">
            {lineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="anio" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cantidad"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Sin datos para graficar.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tabla Paginada con Ordenamiento */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Detalle de Patentamientos</h2>
          <span className="text-xs text-slate-400">
            Página {currentPage} de {totalPages}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 border-b border-slate-800 select-none">
              <tr>
                <th
                  onClick={() => handleSort('periodo')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800/60 hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Período</span>
                    {renderSortIcon('periodo')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('marca')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800/60 hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Marca</span>
                    {renderSortIcon('marca')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('modelo')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800/60 hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Modelo</span>
                    {renderSortIcon('modelo')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('origen')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800/60 hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Origen</span>
                    {renderSortIcon('origen')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('provincia')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800/60 hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Provincia</span>
                    {renderSortIcon('provincia')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cantidad')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800/60 hover:text-white transition group text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Cantidad</span>
                    {renderSortIcon('cantidad')}
                  </div>
                </th>
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
                    No se encontraron registros para los filtros seleccionados.
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
