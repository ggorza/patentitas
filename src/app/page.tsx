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
  Globe,
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
  const [selectedMarca, setSelectedMarca] = useState('TODAS');
  const [selectedProvincia, setSelectedProvincia] = useState('TODAS');
  const [selectedOrigen, setSelectedOrigen] = useState('TODOS');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Ordenamiento
  const [sortColumn, setSortColumn] = useState<SortColumn>('cantidad');
  const [sortAscending, setSortAscending] = useState(false);

  // Listas para los dropdowns
  const [aniosDisponibles, setAniosDisponibles] = useState<string[]>(['TODOS']);
  const [marcasDisponibles, setMarcasDisponibles] = useState<string[]>(['TODAS']);
  const [provinciasDisponibles, setProvinciasDisponibles] = useState<string[]>(['TODAS']);
  const [origenesDisponibles, setOrigenesDisponibles] = useState<string[]>(['TODOS']);

  // Métricas y gráficos
  const [totalPatentamientos, setTotalPatentamientos] = useState(0);
  const [topMarca, setTopMarca] = useState({ nombre: '-', total: 0 });
  const [barChartData, setBarChartData] = useState<{ marca: string; cantidad: number }[]>([]);
  const [lineChartData, setLineChartData] = useState<{ anio: number; cantidad: number }[]>([]);

  // 1. Cargar opciones de los dropdowns una sola vez
  useEffect(() => {
    async function loadDimensions() {
      const { data: totales } = await supabase
        .from('vista_totales_anuales')
        .select('anio')
        .order('anio', { ascending: false });

      if (totales) {
        setAniosDisponibles(['TODOS', ...totales.map((t: { anio: number }) => String(t.anio))]);
      }

      const { data: dims } = await supabase
        .from('vista_dimensiones_filtro')
        .select('*');

      if (dims) {
        const marcas = Array.from(new Set(dims.map((d) => d.marca))).filter(Boolean).sort();
        const provs = Array.from(new Set(dims.map((d) => d.provincia))).filter(Boolean).sort();
        const origs = Array.from(new Set(dims.map((d) => d.origen))).filter(Boolean).sort();

        setMarcasDisponibles(['TODAS', ...marcas]);
        setProvinciasDisponibles(['TODAS', ...provs]);
        setOrigenesDisponibles(['TODOS', ...origs]);
      }
    }
    loadDimensions();
  }, []);

  // 2. Cargar métricas agregadas y datos para gráficos respetando filtros
  const loadAggregatedData = useCallback(async () => {
    setLoading(true);

    let query = supabase.from('patentamientos_resumen').select('anio, marca, cantidad');

    if (selectedAnio !== 'TODOS') query = query.eq('anio', Number(selectedAnio));
    if (selectedMarca !== 'TODAS') query = query.eq('marca', selectedMarca);
    if (selectedProvincia !== 'TODAS') query = query.eq('provincia', selectedProvincia);
    if (selectedOrigen !== 'TODOS') query = query.eq('origen', selectedOrigen);

    const cleaned = searchTerm.trim();
    if (cleaned.length > 0) {
      query = query.or(`marca.ilike.%${cleaned}%,modelo.ilike.%${cleaned}%`);
    }

    // Limitamos a un muestreo representativo alto para agregaciones rápidas
    const { data: rows, error } = await query.limit(50000);

    if (!error && rows) {
      let total = 0;
      const porMarca: Record<string, number> = {};
      const porAnio: Record<number, number> = {};

      rows.forEach((r) => {
        const qty = Number(r.cantidad);
        total += qty;
        porMarca[r.marca] = (porMarca[r.marca] || 0) + qty;
        porAnio[r.anio] = (porAnio[r.anio] || 0) + qty;
      });

      setTotalPatentamientos(total);

      // Bar Chart: Top 10 marcas
      const sortedMarcas = Object.entries(porMarca)
        .map(([marca, cantidad]) => ({ marca, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      if (sortedMarcas.length > 0) {
        setTopMarca({ nombre: sortedMarcas[0].marca, total: sortedMarcas[0].cantidad });
        setBarChartData(sortedMarcas.slice(0, 10));
      } else {
        setTopMarca({ nombre: '-', total: 0 });
        setBarChartData([]);
      }

      // Line Chart: Evolución interanual
      const sortedAnios = Object.entries(porAnio)
        .map(([anio, cantidad]) => ({ anio: Number(anio), cantidad }))
        .sort((a, b) => a.anio - b.anio);

      setLineChartData(sortedAnios);
    }

    setLoading(false);
  }, [selectedAnio, selectedMarca, selectedProvincia, selectedOrigen, searchTerm]);

  // 3. Cargar tabla paginada con ordenamiento
  const loadTableData = useCallback(async () => {
    setTableLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from('patentamientos_resumen').select('*', { count: 'estimated' });

    if (selectedAnio !== 'TODOS') query = query.eq('anio', Number(selectedAnio));
    if (selectedMarca !== 'TODAS') query = query.eq('marca', selectedMarca);
    if (selectedProvincia !== 'TODAS') query = query.eq('provincia', selectedProvincia);
    if (selectedOrigen !== 'TODOS') query = query.eq('origen', selectedOrigen);

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
  }, [selectedAnio, selectedMarca, selectedProvincia, selectedOrigen, searchTerm, currentPage, sortColumn, sortAscending]);

  useEffect(() => {
    const handler = setTimeout(() => {
      loadAggregatedData();
      loadTableData();
    }, 250);
    return () => clearTimeout(handler);
  }, [loadAggregatedData, loadTableData]);

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
            loadAggregatedData();
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
          <span className="text-xs text-slate-500 mt-1 block">Unidades bajo filtro actual</span>
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

      {/* Filtros Completos */}
      <section className="bg-slate-900/40 p-4 border border-slate-800 rounded-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Año</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                <select
                  value={selectedAnio}
                  onChange={(e) => {
                    setSelectedAnio(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {aniosDisponibles.map((a) => (
                    <option key={a} value={a}>
                      {a === 'TODOS' ? 'Todos' : a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Marca</label>
              <select
                value={selectedMarca}
                onChange={(e) => {
                  setSelectedMarca(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 truncate"
              >
                {marcasDisponibles.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Provincia</label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                <select
                  value={selectedProvincia}
                  onChange={(e) => {
                    setSelectedProvincia(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 truncate"
                >
                  {provinciasDisponibles.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Origen</label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                <select
                  value={selectedOrigen}
                  onChange={(e) => {
                    setSelectedOrigen(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 truncate"
                >
                  {origenesDisponibles.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gráficos: Top 10 Marcas + Evolución Interanual */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Top 10 */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top Marcas (Selección Actual)</h2>
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

        {/* Gráfico 2: Evolución Interanual */}
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
