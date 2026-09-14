'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
import { Car, Award, MapPin, Layers, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [data, setData] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarca, setSelectedMarca] = useState('TODAS');
  const [selectedProvincia, setSelectedProvincia] = useState('TODAS');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // Traemos los registros agregados desde Supabase
    const { data: rows, error } = await supabase
      .from('patentamientos_resumen')
      .select('*')
      .order('cantidad', { ascending: false });

    if (error) {
      console.error('Error al consultar Supabase:', error.message);
    } else if (rows) {
      setData(rows);
    }
    setLoading(false);
  }

  // Opciones únicas para selectores
  const marcasDisponibles = useMemo(() => {
    const list = Array.from(new Set(data.map((d) => d.marca))).filter(Boolean);
    return ['TODAS', ...list.sort()];
  }, [data]);

  const provinciasDisponibles = useMemo(() => {
    const list = Array.from(new Set(data.map((d) => d.provincia))).filter(Boolean);
    return ['TODAS', ...list.sort()];
  }, [data]);

  // Filtrado reactivo
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchMarca = selectedMarca === 'TODAS' || item.marca === selectedMarca;
      const matchProv = selectedProvincia === 'TODAS' || item.provincia === selectedProvincia;
      return matchMarca && matchProv;
    });
  }, [data, selectedMarca, selectedProvincia]);

  // Métricas calculadas
  const totalPatentamientos = useMemo(() => {
    return filteredData.reduce((acc, curr) => acc + curr.cantidad, 0);
  }, [filteredData]);

  const topMarca = useMemo(() => {
    if (filteredData.length === 0) return { nombre: '-', total: 0 };
    const agrupado: Record<string, number> = {};
    filteredData.forEach((d) => {
      agrupado[d.marca] = (agrupado[d.marca] || 0) + d.cantidad;
    });
    const sorted = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
    return { nombre: sorted[0][0], total: sorted[0][1] };
  }, [filteredData]);

  const topModelo = useMemo(() => {
    if (filteredData.length === 0) return { nombre: '-', total: 0 };
    const agrupado: Record<string, number> = {};
    filteredData.forEach((d) => {
      const key = `${d.marca} ${d.modelo}`;
      agrupado[key] = (agrupado[key] || 0) + d.cantidad;
    });
    const sorted = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
    return { nombre: sorted[0][0], total: sorted[0][1] };
  }, [filteredData]);

  // Datos para gráfico Top 10 Marcas
  const chartData = useMemo(() => {
    const agrupado: Record<string, number> = {};
    filteredData.forEach((d) => {
      agrupado[d.marca] = (agrupado[d.marca] || 0) + d.cantidad;
    });
    return Object.entries(agrupado)
      .map(([marca, cantidad]) => ({ marca, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }, [filteredData]);

  // Paginación de tabla
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;

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
            Métricas de patentamientos 0km en Argentina (DNRPA Datos Abiertos)
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition border border-slate-700 self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refrescar datos
        </button>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Patentamientos</span>
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {loading ? '...' : totalPatentamientos.toLocaleString('es-AR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Unidades registradas</span>
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
            {loading ? '...' : `${topMarca.total.toLocaleString('es-AR')} patentamientos`}
          </span>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Modelo Líder</span>
            <Car className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-white mt-2 truncate">
            {loading ? '...' : topModelo.nombre}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">
            {loading ? '...' : `${topModelo.total.toLocaleString('es-AR')} unidades`}
          </span>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Jurisdicciones</span>
            <MapPin className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {loading ? '...' : provinciasDisponibles.length - 1}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Provincias con actividad</span>
        </div>
      </section>

      {/* Filtros */}
      <section className="flex flex-col sm:flex-row gap-4 bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400 mb-1">Filtrar por Marca</label>
          <select
            value={selectedMarca}
            onChange={(e) => {
              setSelectedMarca(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {marcasDisponibles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400 mb-1">Filtrar por Provincia</label>
          <select
            value={selectedProvincia}
            onChange={(e) => {
              setSelectedProvincia(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {provinciasDisponibles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Gráfico de barras */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Top 10 Marcas en el período</h2>
        <div className="h-72 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="marca"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }}
                  itemStyle={{ color: '#60a5fa' }}
                />
                <Bar dataKey="cantidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Sin datos para mostrar con los filtros aplicados.
            </div>
          )}
        </div>
      </section>

      {/* Tabla de registros */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Detalle de Patentamientos Agrupados</h2>
          <span className="text-xs text-slate-400">
            Mostrando {paginatedData.length} de {filteredData.length} combinaciones
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
              {paginatedData.length > 0 ? (
                paginatedData.map((row, idx) => (
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
                    No se encontraron registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Página {currentPage} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
