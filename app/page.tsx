'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

type BulanData = {
  kod: string
  nama: string
  sawit_hasil: number
  getah_hasil: number
}

export default function DashboardPage() {
  const [data, setData] = useState<BulanData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data: rows, error } = await supabase
        .from('hasil_bulanan')
        .select('*')
        .order('kod_bulan', { ascending: true })

      if (error) {
        console.error('Error fetching data:', error)
        setLoading(false)
        return
      }

      const grouped = (rows as HasilRow[]).reduce(
        (acc: Record<string, BulanData>, row) => {
          if (!acc[row.kod_bulan]) {
            acc[row.kod_bulan] = {
              kod: row.kod_bulan,
              nama: row.nama_bulan,
              sawit_hasil: 0,
              getah_hasil: 0,
            }
          }
          if (row.jenis === 'sawit') {
            acc[row.kod_bulan].sawit_hasil += row.hasil || 0
          } else {
            acc[row.kod_bulan].getah_hasil += row.hasil || 0
          }
          return acc
        },
        {}
      )

      setData(Object.values(grouped))
      setLoading(false)
    }

    fetch()
  }, [])

  // Halang copy/paste, right-click, dan keyboard shortcuts
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault()
    const blockCopy = (e: ClipboardEvent) => e.preventDefault()
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      // Ctrl/Cmd + C/X/A/S/P/U  dan  F12
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

  const totalSawit = data.reduce((sum, d) => sum + d.sawit_hasil, 0)
  const totalGetah = data.reduce((sum, d) => sum + d.getah_hasil, 0)
  const latestMonth = data[data.length - 1]

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 select-none"
      style={{ WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none', userSelect: 'none' }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Laporan Hasil Bulanan</h1>
          <p className="text-gray-600">Dashboard Awam — Ringkasan Prestasi Sawit & Getah</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Total Hasil Sawit</div>
            <div className="text-3xl font-bold text-orange-600">{totalSawit.toLocaleString('ms-MY', { maximumFractionDigits: 1 })} MT</div>
            <p className="text-xs text-gray-500 mt-2">{data.length} bulan data</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Total Hasil Getah</div>
            <div className="text-3xl font-bold text-amber-600">{totalGetah.toLocaleString('ms-MY')} KG</div>
            <p className="text-xs text-gray-500 mt-2">{data.length} bulan data</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Bulan Terkini</div>
            <div className="text-2xl font-bold text-gray-900">{latestMonth?.nama}</div>
            <p className="text-xs text-gray-500 mt-2">Setakat {latestMonth?.nama}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Trend Hasil Mengikut Bulan</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <XAxis dataKey="nama" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => (typeof v === 'number' ? v.toLocaleString('ms-MY') : v)} />
              <Bar dataKey="sawit_hasil" fill="#ea580c" name="Sawit (MT)" />
              <Bar dataKey="getah_hasil" fill="#b45309" name="Getah (KG)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">Bulan</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Hasil Sawit (MT)</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Hasil Getah (KG)</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{row.nama}</td>
                    <td className="px-6 py-4 text-right text-orange-600 font-semibold">
                      {row.sawit_hasil.toLocaleString('ms-MY', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-6 py-4 text-right text-amber-600 font-semibold">
                      {row.getah_hasil.toLocaleString('ms-MY')}
                    </td>
                  </tr>
                ))}
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
