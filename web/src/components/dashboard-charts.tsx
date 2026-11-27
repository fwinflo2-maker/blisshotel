'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type TrendPoint = { period: string; lodging: number; invoiced: number; restaurant: number; reservations: number };

const money = (value: number, currency: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);
const tick = (value: string) => value.length === 10 ? value.slice(5) : value;

export function RevenueTrendChart({ data, currency = 'XAF', compact = false }: { data: TrendPoint[]; currency?: string; compact?: boolean }) {
  const hasValues = data.some((item) => item.lodging || item.invoiced || item.restaurant || item.reservations);
  const plotData = data.length ? data : [{ period: 'Période', lodging: 0, invoiced: 0, restaurant: 0, reservations: 0 }];
  return <div style={{ width: '100%', height: compact ? 250 : 320, minWidth: 0, position: 'relative' }}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={plotData} margin={{ top: 14, right: 14, left: 0, bottom: 4 }}>
        <defs><linearGradient id="lodgingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8935f" stopOpacity={0.32} /><stop offset="95%" stopColor="#b8935f" stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid stroke="#dfe5df" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="period" tickFormatter={tick} minTickGap={24} tick={{ fill: '#7c887f', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="money" tickFormatter={(value) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} tick={{ fill: '#7c887f', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
        <YAxis yAxisId="count" orientation="right" tick={{ fill: '#7c887f', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip formatter={(value, name) => name === 'Réservations' ? [value, name] : [money(Number(value), currency), name]} labelFormatter={(label) => `Période : ${label}`} contentStyle={{ borderRadius: 10, border: '1px solid #e3e8e1', boxShadow: '0 8px 24px #18322514', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Area yAxisId="money" type="monotone" dataKey="lodging" name="Hébergement" stroke="#b8935f" fill="url(#lodgingFill)" strokeWidth={2.5} connectNulls isAnimationActive="auto" />
        <Line yAxisId="money" type="monotone" dataKey="invoiced" name="Facturation totale" stroke="#355d4d" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls isAnimationActive="auto" />
        <Line yAxisId="money" type="monotone" dataKey="restaurant" name="Bar-restaurant" stroke="#7488c4" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls isAnimationActive="auto" />
        <Line yAxisId="count" type="monotone" dataKey="reservations" name="Réservations" stroke="#e49b50" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls isAnimationActive="auto" />
      </AreaChart>
    </ResponsiveContainer>
    {!hasValues && <div style={{ position: 'absolute', inset: 42, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#78847b', fontSize: 12 }}>Aucun mouvement enregistré sur cette période — graphique prêt à se remplir.</div>}
  </div>;
}

export function RestaurantSalesChart({ data, currency = 'XAF' }: { data: { name: string; resident: number; visitor: number }[]; currency?: string }) {
  const chartData = data.length ? data : [{ name: 'Aucune vente', resident: 0, visitor: 0 }];
  return <div style={{ width: '100%', height: 260, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 14, right: 10, left: 0, bottom: 5 }}>
    <CartesianGrid stroke="#dfe5df" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#7c887f', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(value)} tick={{ fill: '#7c887f', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
    <Tooltip formatter={(value) => [money(Number(value), currency)]} contentStyle={{ borderRadius: 10, border: '1px solid #e3e8e1', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="resident" name="Clients hébergés" stackId="sales" fill="#b8935f" radius={[4, 4, 0, 0]} isAnimationActive /><Bar dataKey="visitor" name="Non-résidents" stackId="sales" fill="#4f927c" radius={[4, 4, 0, 0]} isAnimationActive />
  </BarChart></ResponsiveContainer></div>;
}
