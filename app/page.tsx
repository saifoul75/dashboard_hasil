'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NO_SELECT_STYLE = {
  userSelect: 'none' as const,
  WebkitUserSelect: 'none' as const,
}
const AXIS_TICK = { fontSize: 12 }
const ALL = 'ALL'

type HasilRow = {
  id: string
  kod_bulan: string
  nama_bulan: string
  jenis: 'sawit' | 'getah'
  pol_pn: string
  bil: number
  nama: string
  peserta: number
  luas_hek: number
  luas_operasi: number
  hasil: number
  hasil_per_hek: number
  matlamat_setahun: number
  pct_setahun: number
  pendapatan: number
  kos: number
  untung_rugi: number
}

function nf(n: number, d = 1) {
  return (n || 0).toLocaleString('ms-MY', { maximumFractionDigits: d })
}

function sum(arr: HasilRow[], key: keyof HasilRow): number {
  return arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

export default function DashboardPage() {
  const [rows, setRows] = useState<HasilRow[]>([])
  const [loading, setLoading] = useState(true)
  const [po, setPo] = useState<string>(ALL)
  const [bulan, setBulan] = useState<string>(ALL)

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from('hasil_bulanan')
        .select('*')
        .order('kod_bulan', { ascending: true })

      if (error) {
        console.error('Error fetching data:', error)
        setLoading(false)
        return
      }
      setRows((data as HasilRow[]) || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // Halang copy/paste, right-click, dan keyboard shortcuts
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault()
    const blockCopy = (e: ClipboardEvent) => e.preventDefault()
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].includes(k)) {
        e.preventDefault()
      }
      if (k === 'f12') e.preventDefault()
    }
    document.addEventListener('contextmenu', blockContextMenu)
    document.addEventListener('copy', blockCopy)
    document.addEventListener('cut', blockCopy)
    document.addEventListener('keydown', blockKeys)
    return () => {
      document.removeEventListener('contextmenu', blockContextMenu)
      document.removeEventListener('copy', blockCopy)
      document.removeEventListener('cut', blockCopy)
      document.removeEventListener('keydown', blockKeys)
    }
  }, [])

  // Senarai Pusat Operasi (unik) — pusat operasi sahaja
  const senaraiPO = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.pol_pn) set.add(r.pol_pn)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  // Senarai bulan (unik, hanya yang ada data)
  const senaraiBulan = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((r) => {
      if ((Number(r.hasil) || 0) > 0 && r.kod_bulan)
        map.set(r.kod_bulan, r.nama_bulan)
    })
    return Array.from(map, ([kod, nama]) => ({ kod, nama })).sort((a, b) =>
      a.kod.localeCompare(b.kod)
    )
  }, [rows])

  // Baris ditapis ikut PO + bulan
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (po === ALL || r.pol_pn === po) &&
          (bulan === ALL || r.kod_bulan === bulan)
      ),
    [rows, po, bulan]
  )

  // Agregat hasil + hasil/hek (dikira dari jumlah, bukan purata baris)
  const agg = useMemo(() => {
    const sawit = filtered.filter((r) => r.jenis === 'sawit')
    const getah = filtered.filter((r) => r.jenis === 'getah')
    const sawitHasil = sum(sawit, 'hasil')
    const getahHasil = sum(getah, 'hasil')
    const sawitLuas = sum(sawit, 'luas_operasi')
    const getahLuas = sum(getah, 'luas_operasi')
    return {
      sawitHasil,
      getahHasil,
      sawitPerHek: sawitLuas > 0 ? sawitHasil / sawitLuas : 0,
      getahPerHek: getahLuas > 0 ? getahHasil / getahLuas : 0,
      peserta: sum(filtered, 'peserta'),
    }
  }, [filtered])

  // Trend bulanan (ikut PO terpilih, abaikan tapisan bulan)
  const trend = useMemo(() => {
    const ikutPO = rows.filter((r) => po === ALL || r.pol_pn === po)
    const map = new Map<
      string,
      { kod: string; nama: string; Sawit: number; Getah: number }
    >()
    ikutPO.forEach((r) => {
      if (!map.has(r.kod_bulan)) {
        map.set(r.kod_bulan, {
          kod: r.kod_bulan,
          nama: r.nama_bulan,
          Sawit: 0,
          Getah: 0,
        })
      }
      const m = map.get(r.kod_bulan)!
      if (r.jenis === 'sawit') m.Sawit += Number(r.hasil) || 0
      else m.Getah += Number(r.hasil) || 0
    })
    return Array.from(map.values())
      .filter((m) => m.Sawit > 0 || m.Getah > 0)
      .sort((a, b) => a.kod.localeCompare(b.kod))
  }, [rows, po])

  // Jadual pecahan ikut Pusat Operasi (ikut tapisan semasa)
  const jadual = useMemo(() => {
    const map = new Map<
      string,
      {
        pol_pn: string
        sawitHasil: number
        sawitLuas: number
        getahHasil: number
        getahLuas: number
      }
    >()
    filtered.forEach((r) => {
      if (!map.has(r.pol_pn)) {
        map.set(r.pol_pn, {
          pol_pn: r.pol_pn,
          sawitHasil: 0,
          sawitLuas: 0,
          getahHasil: 0,
          getahLuas: 0,
        })
      }
      const m = map.get(r.pol_pn)!
      if (r.jenis === 'sawit') {
        m.sawitHasil += Number(r.hasil) || 0
        m.sawitLuas += Number(r.luas_operasi) || 0
      } else {
        m.getahHasil += Number(r.hasil) || 0
        m.getahLuas += Number(r.luas_operasi) || 0
      }
    })
    return Array.from(map.values()).sort((a, b) =>
      a.pol_pn.localeCompare(b.pol_pn)
    )
  }, [filtered])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat data...</p>
        </div>
      </div>
    )
  }

  const namaPO = po === ALL ? 'Semua Pusat Operasi' : po
  const labelBulan =
    bulan === ALL
      ? 'Setakat (semua bulan)'
      : senaraiBulan.find((b) => b.kod === bulan)?.nama ?? bulan

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 select-none"
      style={NO_SELECT_STYLE}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">
            Laporan Hasil Bulanan
          </h1>
          <p className="text-sm text-gray-600">
            Dashboard Awam — Prestasi Sawit &amp; Getah mengikut Pusat Operasi
          </p>
        </div>

        {/* Penapis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Pusat Operasi (PO)
            </label>
            <select
              value={po}
              onChange={(e) => setPo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value={ALL}>Semua Pusat Operasi</option>
              {senaraiPO.map((kod) => (
                <option key={kod} value={kod}>
                  {kod}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Bulan
            </label>
            <select
              value={bulan}
              onChange={(e) => setBulan(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value={ALL}>Setakat (semua bulan)</option>
              {senaraiBulan.map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Konteks */}
        <div className="mb-4 text-sm text-gray-700">
          Menunjukkan: <span className="font-semibold">{namaPO}</span> ·{' '}
          <span className="font-semibold">{labelBulan}</span>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Hasil Sawit
            </div>
            <div className="text-3xl font-bold text-orange-600">
              {nf(agg.sawitHasil)} MT
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {nf(agg.sawitPerHek, 2)} MT/hek
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Hasil Getah
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {nf(agg.getahHasil, 0)} kg
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {nf(agg.getahPerHek, 2)} kg/hek
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Jumlah Peserta
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {nf(agg.peserta, 0)}
            </div>
            <p className="text-xs text-gray-500 mt-2">{labelBulan}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Trend Hasil Mengikut Bulan {po !== ALL ? `— ${po}` : ''}
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend}>
              <XAxis dataKey="nama" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip
                formatter={(v) =>
                  typeof v === 'number' ? v.toLocaleString('ms-MY') : v
                }
              />
              <Legend />
              <Bar dataKey="Sawit" fill="#ea580c" name="Sawit (MT)" />
              <Bar dataKey="Getah" fill="#b45309" name="Getah (kg)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Jadual pecahan ikut PO */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Pecahan Mengikut Pusat Operasi
            </h2>
            <p className="text-xs text-gray-500">{labelBulan}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                    Pusat Operasi
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">
                    Sawit (MT)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">
                    MT/hek
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">
                    Getah (kg)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">
                    kg/hek
                  </th>
                </tr>
              </thead>
              <tbody>
                {jadual.map((r) => (
                  <tr
                    key={r.pol_pn}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.pol_pn}
                    </td>
                    <td className="px-4 py-3 text-right text-orange-600 font-semibold">
                      {nf(r.sawitHasil)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {nf(r.sawitLuas > 0 ? r.sawitHasil / r.sawitLuas : 0, 2)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600 font-semibold">
                      {nf(r.getahHasil, 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {nf(r.getahLuas > 0 ? r.getahHasil / r.getahLuas : 0, 2)}
                    </td>
                  </tr>
                ))}
                {jadual.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      Tiada data untuk pilihan ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>Dashboard Laporan Hasil Bulanan — Paparan Awam Tanpa Login</p>
          <p>Data diperbaharui secara real-time dari Supabase</p>
        </div>
      </div>
    </div>
  )
}
