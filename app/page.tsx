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

// Normalisasi nama PO: huruf besar, titik jadi jarak, buang jarak berlebihan
function normPO(s: string): string {
  return (s || '')
    .toUpperCase()
    .split('.')
    .join(' ')
    .split(' ')
    .filter(Boolean)
    .join(' ')
}

// Padanan Pusat Operasi (pol_pn) -> Negeri (kunci dalam bentuk ternormal)
const PO_TO_NEGERI: Record<string, string> = {
  BESUT: 'Terengganu',
  DUNGUN: 'Terengganu',
  'KUALA BERANG': 'Terengganu',
  GERIK: 'Perak',
  'KG GAJAH': 'Perak',
  'KUALA KANGSAR': 'Perak',
  MANJUNG: 'Perak',
  SELAMA: 'Perak',
  TAPAH: 'Perak',
  KUANTAN: 'Pahang',
  LIPIS: 'Pahang',
  PEKAN: 'Pahang',
  RAUB: 'Pahang',
  ROMPIN: 'Pahang',
  TEMERLOH: 'Pahang',
  MACHANG: 'Kelantan',
  KEDAH: 'Kedah',
  JOHOR: 'Johor',
  MELAKA: 'Melaka',
  'N SEMBILAN': 'Negeri Sembilan',
  SELANGOR: 'Selangor',
}

// Padanan Negeri -> Wilayah (RISDA)
const NEGERI_TO_WILAYAH: Record<string, string> = {
  Perak: 'Utara',
  Kedah: 'Utara',
  Selangor: 'Utara',
  Terengganu: 'Timur',
  Kelantan: 'Timur',
  Pahang: 'Tengah',
  'Negeri Sembilan': 'Selatan',
  Melaka: 'Selatan',
  Johor: 'Selatan',
}

const WILAYAH_ORDER = ['Utara', 'Timur', 'Tengah', 'Selatan']

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

function negeriOf(r: HasilRow): string {
  return r.negeri || PO_TO_NEGERI[normPO(r.pol_pn)] || 'Lain-lain'
}

function wilayahOf(r: HasilRow): string {
  return r.wilayah || NEGERI_TO_WILAYAH[negeriOf(r)] || 'Lain-lain'
}

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
  const [wilayah, setWilayah] = useState<string>(ALL)
  const [negeri, setNegeri] = useState<string>(ALL)
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

  // Senarai Wilayah (susunan tetap, hanya yang ada data)
  const senaraiWilayah = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => set.add(wilayahOf(r)))
    const ordered = WILAYAH_ORDER.filter((w) => set.has(w))
    const extra = Array.from(set)
      .filter((w) => !WILAYAH_ORDER.includes(w))
      .sort((a, b) => a.localeCompare(b))
    return [...ordered, ...extra]
  }, [rows])

  // Senarai Negeri (bergantung pada Wilayah terpilih)
  const senaraiNegeri = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (wilayah === ALL || wilayahOf(r) === wilayah) set.add(negeriOf(r))
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows, wilayah])

  // Senarai Pusat Operasi (bergantung pada Wilayah + Negeri terpilih)
  const senaraiPO = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (
        (wilayah === ALL || wilayahOf(r) === wilayah) &&
        (negeri === ALL || negeriOf(r) === negeri) &&
        r.pol_pn
      ) {
        set.add(r.pol_pn)
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows, wilayah, negeri])

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

  function pilihWilayah(v: string) {
    setWilayah(v)
    setNegeri(ALL)
    setPo(ALL)
  }
  function pilihNegeri(v: string) {
    setNegeri(v)
    setPo(ALL)
  }

  // Tapisan geografi (Wilayah -> Negeri -> PO), abaikan bulan
  const geoFiltered = useMemo(
    () =>
      augmented.filter(
        (r) =>
          (wilayah === ALL || wilayahOf(r) === wilayah) &&
          (negeri === ALL || negeriOf(r) === negeri) &&
          (po === ALL || r.pol_pn === po)
      ),
    [augmented, wilayah, negeri, po]
  )

  // Baris ditapis penuh (termasuk bulan)
  const filtered = useMemo(
    () => geoFiltered.filter((r) => bulan === ALL || r.kod_bulan === bulan),
    [geoFiltered, bulan]
  )

  // Tanaman yang wujud dalam skop geografi semasa
  const hasSawit = useMemo(
    () => geoFiltered.some((r) => r.jenis === 'sawit' && (Number(r.hasil) || 0) > 0),
    [geoFiltered]
  )
  const hasGetah = useMemo(
    () => geoFiltered.some((r) => r.jenis === 'getah' && (Number(r.hasil) || 0) > 0),
    [geoFiltered]
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

  // Trend bulanan (increment, ikut tapisan geografi, abaikan tapisan bulan)
  const trend = useMemo(() => {
    const map = new Map<
      string,
      { kod: string; nama: string; Sawit: number; Getah: number }
    >()
    geoFiltered.forEach((r) => {
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
  }, [geoFiltered])

  // Aras pecahan adaptif ikut tahap tapisan
  // Tiada tapisan -> Wilayah; Wilayah -> Negeri; Negeri -> PO; PO -> Bulan
  const groupLabel =
    po !== ALL
      ? 'Bulan'
      : negeri !== ALL
      ? 'Pusat Operasi'
      : wilayah !== ALL
      ? 'Negeri'
      : 'Wilayah'

  // Jadual pecahan adaptif
  const jadual = useMemo(() => {
    const info = (r: AugRow): { key: string; label: string } => {
      if (po !== ALL) return { key: r.kod_bulan, label: r.nama_bulan || r.kod_bulan }
      if (negeri !== ALL) return { key: r.pol_pn || 'Lain-lain', label: r.pol_pn || 'Lain-lain' }
      if (wilayah !== ALL) {
        const n = negeriOf(r)
        return { key: n, label: n }
      }
      const w = wilayahOf(r)
      return { key: w, label: w }
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
    if (groupLabel === 'Wilayah') {
      return list.sort((a, b) => {
        const ia = WILAYAH_ORDER.indexOf(a.key)
        const ib = WILAYAH_ORDER.indexOf(b.key)
        if (ia !== -1 && ib !== -1) return ia - ib
        return a.label.localeCompare(b.label)
      })
    }
    if (groupLabel === 'Bulan') {
      return list.sort((a, b) => a.key.localeCompare(b.key))
    }
    return list.sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered, wilayah, negeri, po, groupLabel])

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

  const labelWilayah = wilayah === ALL ? 'Semua Wilayah' : wilayah
  const labelNegeri = negeri === ALL ? 'Semua Negeri' : negeri
  const namaPO = po === ALL ? 'Semua Pusat Operasi' : po
  const labelBulan =
    bulan === ALL
      ? 'Setakat (semua bulan)'
      : senaraiBulan.find((b) => b.kod === bulan)?.nama ?? bulan
  const skop =
    po !== ALL ? po : negeri !== ALL ? negeri : wilayah !== ALL ? wilayah : ''
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
            Dashboard Awam — Prestasi Sawit &amp; Getah mengikut Wilayah, Negeri
            &amp; Pusat Operasi
          </p>
        </div>

        {/* Penapis bertingkat */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Wilayah
            </label>
            <select
              value={wilayah}
              onChange={(e) => pilihWilayah(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value={ALL}>Semua Wilayah</option>
              {senaraiWilayah.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Negeri
            </label>
            <select
              value={negeri}
              onChange={(e) => pilihNegeri(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value={ALL}>Semua Negeri</option>
              {senaraiNegeri.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
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
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Bulan
            </label>
            <select
              value={bulan}
              onChange={(e) => setBulan(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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
          Menunjukkan: <span className="font-semibold">{labelWilayah}</span>{' '}
          · <span className="font-semibold">{labelNegeri}</span>{' '}
          · <span className="font-semibold">{namaPO}</span>{' '}
          · <span className="font-semibold">{labelBulan}</span>
        </div>

        {/* Stats Cards */}
        {bilanganTanaman === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 text-center text-gray-500">
            Tiada data hasil untuk pilihan ini.
          </div>
        ) : (
          <div
            className={
              bilanganTanaman === 2
                ? 'grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8'
                : 'grid grid-cols-1 gap-6 mb-8'
            }
          >
            {hasSawit && (
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
            )}

            {hasGetah && (
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
            )}
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Trend Hasil Mengikut Bulan {skop ? `— ${skop}` : ''}
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
              {hasSawit && (
                <Bar dataKey="Sawit" fill="#ea580c" name="Sawit (MT)" />
              )}
              {hasGetah && (
                <Bar dataKey="Getah" fill="#b45309" name="Getah (kg)" />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Jadual pecahan adaptif */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Pecahan Mengikut {groupLabel}
            </h2>
            <p className="text-xs text-gray-500">{labelBulan}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                    {groupLabel}
                  </th>
                  {hasSawit && (
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">
                      Sawit (MT)
                    </th>
                  )}
                  {hasSawit && (
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">
                      MT/hek
                    </th>
                  )}
                  {hasGetah && (
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">
                      Getah (kg)
                    </th>
                  )}
                  {hasGetah && (
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">
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
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.label}
                    </td>
                    {hasSawit && (
                      <td className="px-4 py-3 text-right text-orange-600 font-semibold">
                        {nf(r.sawitHasil)}
                      </td>
                    )}
                    {hasSawit && (
                      <td className="px-4 py-3 text-right text-gray-700">
                        {nf(r.sawitLuas > 0 ? r.sawitHasil / r.sawitLuas : 0, 2)}
                      </td>
                    )}
                    {hasGetah && (
                      <td className="px-4 py-3 text-right text-amber-600 font-semibold">
                        {nf(r.getahHasil, 0)}
                      </td>
                    )}
                    {hasGetah && (
                      <td className="px-4 py-3 text-right text-gray-700">
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
