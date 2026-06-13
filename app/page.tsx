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
const LEGEND_STYLE = { fontSize: 12 }
const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 }
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
  negeri?: string | null
  wilayah?: string | null
}

// Baris dengan hasil increment bulanan (inc) yang dikira dari nilai kumulatif
type AugRow = HasilRow & { inc: number }

function nf(n: number, d = 1) {
  return (n || 0).toLocaleString('ms-MY', { maximumFractionDigits: d })
}

// Jumlah hasil = campur increment bulanan
function hasilInc(arr: AugRow[]): number {
  return arr.reduce((s, r) => s + (Number(r.inc) || 0), 0)
}

// Luas = kawasan operasi (stok, bukan aliran). Ambil bulan TERKINI bagi setiap
// projek, kemudian campur antara projek. Jangan campur antara bulan.
function luasLatest(arr: AugRow[]): number {
  const byProj = new Map<string, AugRow>()
  arr.forEach((r) => {
    const k = r.pol_pn + '|' + r.nama
    const cur = byProj.get(k)
    if (!cur || r.kod_bulan > cur.kod_bulan) byProj.set(k, r)
  })
  let s = 0
  byProj.forEach((r) => {
    s += Number(r.luas_operasi) || 0
  })
  return s
}

export default function DashboardPage() {
  const [rows, setRows] = useState<HasilRow[]>([])
  const [loading, setLoading] = useState(true)
  const [po, setPo] = useState<string>(ALL)

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

  // Tukar hasil kumulatif -> increment bulanan bagi setiap projek
  // (kunci projek: pol_pn + nama + jenis). Bulan pertama = nilai kumulatifnya.
  // Langkau bulan kumulatif 0 atau jatuh (tanda data belum dimasukkan).
  const augmented = useMemo<AugRow[]>(() => {
    const groups = new Map<string, HasilRow[]>()
    rows.forEach((r) => {
      const k = r.pol_pn + '|' + r.nama + '|' + r.jenis
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    })
    const out: AugRow[] = []
    groups.forEach((list) => {
      list.sort((a, b) => a.kod_bulan.localeCompare(b.kod_bulan))
      let prev = 0
      let started = false
      list.forEach((r) => {
        const cum = Number(r.hasil) || 0
        if (cum <= 0) return
        if (started && cum < prev) return
        const inc = !started ? cum : cum - prev
        prev = cum
        started = true
        out.push({ ...r, inc })
      })
    })
    return out
  }, [rows])

  // Senarai Pusat Operasi (satu-satunya penapis)
  const senaraiPO = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.pol_pn) set.add(r.pol_pn)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  // Tapisan ikut Pusat Operasi sahaja
  const filtered = useMemo(
    () => augmented.filter((r) => po === ALL || r.pol_pn === po),
    [augmented, po]
  )

  // Tanaman yang wujud dalam skop semasa
  const hasSawit = useMemo(
    () => filtered.some((r) => r.jenis === 'sawit' && (Number(r.hasil) || 0) > 0),
    [filtered]
  )
  const hasGetah = useMemo(
    () => filtered.some((r) => r.jenis === 'getah' && (Number(r.hasil) || 0) > 0),
    [filtered]
  )

  // Agregat hasil (increment) + hasil/hek (luas bulan terkini)
  const agg = useMemo(() => {
    const sawit = filtered.filter((r) => r.jenis === 'sawit')
    const getah = filtered.filter((r) => r.jenis === 'getah')
    const sawitHasil = hasilInc(sawit)
    const getahHasil = hasilInc(getah)
    const sawitLuas = luasLatest(sawit)
    const getahLuas = luasLatest(getah)
    return {
      sawitHasil,
      getahHasil,
      sawitPerHek: sawitLuas > 0 ? sawitHasil / sawitLuas : 0,
      getahPerHek: getahLuas > 0 ? getahHasil / getahLuas : 0,
    }
  }, [filtered])

  // Trend bulanan (increment)
  const trend = useMemo(() => {
    const map = new Map<
      string,
      { kod: string; nama: string; Sawit: number; Getah: number }
    >()
    filtered.forEach((r) => {
      if (!map.has(r.kod_bulan)) {
        map.set(r.kod_bulan, {
          kod: r.kod_bulan,
          nama: r.nama_bulan,
          Sawit: 0,
          Getah: 0,
        })
      }
      const m = map.get(r.kod_bulan)!
      if (r.jenis === 'sawit') m.Sawit += Number(r.inc) || 0
      else m.Getah += Number(r.inc) || 0
    })
    return Array.from(map.values())
      .filter((m) => m.Sawit !== 0 || m.Getah !== 0)
      .sort((a, b) => a.kod.localeCompare(b.kod))
  }, [filtered])

  // Tiada PO dipilih -> pecah ikut Pusat Operasi; PO dipilih -> pecah ikut Bulan
  const groupLabel = po !== ALL ? 'Bulan' : 'Pusat Operasi'

  // Jadual pecahan
  const jadual = useMemo(() => {
    const info = (r: AugRow): { key: string; label: string } => {
      if (po !== ALL) return { key: r.kod_bulan, label: r.nama_bulan || r.kod_bulan }
      return { key: r.pol_pn || 'Lain-lain', label: r.pol_pn || 'Lain-lain' }
    }

    const map = new Map<
      string,
      { key: string; label: string; sawitRows: AugRow[]; getahRows: AugRow[] }
    >()
    filtered.forEach((r) => {
      const item = info(r)
      if (!map.has(item.key)) {
        map.set(item.key, {
          key: item.key,
          label: item.label,
          sawitRows: [],
          getahRows: [],
        })
      }
      const g = map.get(item.key)!
      if (r.jenis === 'sawit') g.sawitRows.push(r)
      else g.getahRows.push(r)
    })
    const list = Array.from(map.values()).map((g) => ({
      key: g.key,
      label: g.label,
      sawitHasil: hasilInc(g.sawitRows),
      sawitLuas: luasLatest(g.sawitRows),
      getahHasil: hasilInc(g.getahRows),
      getahLuas: luasLatest(g.getahRows),
    }))
    return list.sort((a, b) =>
      groupLabel === 'Bulan'
        ? a.key.localeCompare(b.key)
        : a.label.localeCompare(b.label)
    )
  }, [filtered, po, groupLabel])

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

  const namaPO = po === ALL ? 'Semua Pusat Operasi' : 'Pusat Operasi ' + po
  const skop = po !== ALL ? po : ''
  const bilanganTanaman = (hasSawit ? 1 : 0) + (hasGetah ? 1 : 0)
  const colSpanKosong = 1 + (hasSawit ? 2 : 0) + (hasGetah ? 2 : 0)

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

        {/* Penapis: Pusat Operasi sahaja */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Pusat Operasi (PO)
            </label>
            <select
              value={po}
              onChange={(e) => setPo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value={ALL}>Semua Pusat Operasi</option>
              {senaraiPO.map((kod) => (
                <option key={kod} value={kod}>
                  {kod}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Konteks */}
        <div className="mb-4 text-sm font-semibold text-gray-700">
          {namaPO}
        </div>

        {/* Stats Cards */}
        {bilanganTanaman === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 text-center text-gray-500">
            Tiada data hasil untuk pilihan ini.
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 mb-6">
            {hasSawit && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 w-full sm:w-36">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Hasil Sawit
                </div>
                <div className="text-base font-bold text-orange-600">
                  {nf(agg.sawitHasil)} MT
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {nf(agg.sawitPerHek, 2)} MT/hek
                </p>
              </div>
            )}

            {hasGetah && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 w-full sm:w-36">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Hasil Getah
                </div>
                <div className="text-base font-bold text-amber-600">
                  {nf(agg.getahHasil, 0)} kg
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {nf(agg.getahPerHek, 2)} kg/hek
                </p>
              </div>
            )}
          </div>
        )}

        {/* Charts: Sawit & Getah berasingan (paksi berbeza) */}
        <div
          className={
            hasSawit && hasGetah
              ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8'
              : 'grid grid-cols-1 gap-4 mb-8'
          }
        >
          {hasSawit && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">
                Trend Hasil Sawit (MT) {skop ? `— ${skop}` : ''}
              </h2>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={trend} margin={CHART_MARGIN}>
                  <XAxis dataKey="nama" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} width={40} />
                  <Tooltip
                    formatter={(v) =>
                      typeof v === 'number' ? v.toLocaleString('ms-MY') : v
                    }
                  />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="Sawit" fill="#ea580c" name="Sawit (MT)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {hasGetah && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">
                Trend Hasil Getah (kg) {skop ? `— ${skop}` : ''}
              </h2>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={trend} margin={CHART_MARGIN}>
                  <XAxis dataKey="nama" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} width={40} />
                  <Tooltip
                    formatter={(v) =>
                      typeof v === 'number' ? v.toLocaleString('ms-MY') : v
                    }
                  />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="Getah" fill="#b45309" name="Getah (kg)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Jadual pecahan */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Pecahan Mengikut {groupLabel}
            </h2>
            <p className="text-xs text-gray-500">{namaPO}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900">
                    {groupLabel}
                  </th>
                  {hasSawit && (
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-900">
                      Sawit (MT)
                    </th>
                  )}
                  {hasSawit && (
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-900">
                      MT/hek
                    </th>
                  )}
                  {hasGetah && (
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-900">
                      Getah (kg)
                    </th>
                  )}
                  {hasGetah && (
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-900">
                      kg/hek
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {jadual.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 text-xs font-medium text-gray-900">
                      {r.label}
                    </td>
                    {hasSawit && (
                      <td className="px-4 py-2 text-right text-xs text-orange-600 font-semibold">
                        {nf(r.sawitHasil)}
                      </td>
                    )}
                    {hasSawit && (
                      <td className="px-4 py-2 text-right text-xs text-gray-700">
                        {nf(r.sawitLuas > 0 ? r.sawitHasil / r.sawitLuas : 0, 2)}
                      </td>
                    )}
                    {hasGetah && (
                      <td className="px-4 py-2 text-right text-xs text-amber-600 font-semibold">
                        {nf(r.getahHasil, 0)}
                      </td>
                    )}
                    {hasGetah && (
                      <td className="px-4 py-2 text-right text-xs text-gray-700">
                        {nf(r.getahLuas > 0 ? r.getahHasil / r.getahLuas : 0, 2)}
                      </td>
                    )}
                  </tr>
                ))}
                {jadual.length === 0 && (
                  <tr>
                    <td
                      colSpan={colSpanKosong}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      Tiada data untuk pilihan ini.
                    </td>
                  </tr>
                )}
              </tbody>
              {jadual.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                    <td className="px-4 py-2 text-xs text-gray-900">JUMLAH</td>
                    {hasSawit && (
                      <td className="px-4 py-2 text-right text-xs text-orange-600">
                        {nf(agg.sawitHasil)}
                      </td>
                    )}
                    {hasSawit && (
                      <td className="px-4 py-2 text-right text-xs text-gray-700">
                        {nf(agg.sawitPerHek, 2)}
                      </td>
                    )}
                    {hasGetah && (
                      <td className="px-4 py-2 text-right text-xs text-amber-600">
                        {nf(agg.getahHasil, 0)}
                      </td>
                    )}
                    {hasGetah && (
                      <td className="px-4 py-2 text-right text-xs text-gray-700">
                        {nf(agg.getahPerHek, 2)}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
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
