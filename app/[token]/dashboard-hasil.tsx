"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { BulanData, HasilRow } from "../../lib/hasil";
import { formatNombor } from "../../lib/hasil";

const CARTA_MARGIN = { top: 8, right: 16, bottom: 8, left: 0 };

function jumlah(rows: HasilRow[], key: keyof HasilRow): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export default function DashboardHasil({ bulan }: { bulan: BulanData[] }) {
  const [kod, setKod] = useState(
    bulan.length ? bulan[bulan.length - 1].kod : ""
  );
  const semasa = useMemo(
    () => bulan.find((b) => b.kod === kod) ?? null,
    [bulan, kod]
  );
  const trend = useMemo(
    () =>
      bulan.map((b) => ({
        nama: b.nama,
        Sawit: Number(jumlah(b.sawit, "hasil").toFixed(2)),
        Getah: Number(jumlah(b.getah, "hasil").toFixed(2)),
      })),
    [bulan]
  );

  if (!bulan.length) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="text-xl font-semibold">Tiada data hasil</h1>
        <p className="mt-2 text-slate-500">
          Belum ada rekod hasil bulanan dalam pangkalan data.
        </p>
      </main>
    );
  }

  const sawit = semasa?.sawit ?? [];
  const getah = semasa?.getah ?? [];

  const kpi = [
    { label: "Hasil Sawit", nilai: formatNombor(jumlah(sawit, "hasil")) + " MT" },
    { label: "Hasil Getah", nilai: formatNombor(jumlah(getah, "hasil")) + " kg" },
    {
      label: "Jumlah Peserta",
      nilai: formatNombor(
        jumlah(sawit, "peserta") + jumlah(getah, "peserta"),
        0
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">
              Dashboard Laporan Hasil Bulanan
            </h1>
            <p className="text-sm text-slate-500">
              Hasil sawit &amp; getah mengikut bulan — Paparan Awam (Baca
              Sahaja)
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Bulan</span>
            <select
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              {bulan.map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.nama}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {kpi.map((k) => (
            <div key={k.label} className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {k.label}
              </div>
              <div className="mt-1 text-xl font-bold">{k.nilai}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-4 font-semibold">Trend Hasil Bulanan</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={CARTA_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nama" fontSize={12} />
                <YAxis yAxisId="kiri" fontSize={12} />
                <YAxis yAxisId="kanan" orientation="right" fontSize={12} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="kiri"
                  type="monotone"
                  dataKey="Sawit"
                  stroke="#16a34a"
                  strokeWidth={2}
                  name="Sawit (MT)"
                />
                <Line
                  yAxisId="kanan"
                  type="monotone"
                  dataKey="Getah"
                  stroke="#b45309"
                  strokeWidth={2}
                  name="Getah (kg)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {sawit.length > 0 && (
          <JadualHasil
            tajuk="Hasil Sawit"
            unit="MT"
            unitHek="MT/hek"
            labelOperasi="Dituai (hek)"
            rows={sawit}
          />
        )}

        {getah.length > 0 && (
          <JadualHasil
            tajuk="Hasil Getah"
            unit="kg"
            unitHek="kg/hek"
            labelOperasi="Ditoreh (hek)"
            rows={getah}
          />
        )}

        <p className="pb-6 text-center text-xs text-slate-400">
          Data dijana dari sistem Laporan MSPO — RISDA Plantation Sdn Bhd
        </p>
      </main>
    </div>
  );
}

function JadualHasil({
  tajuk,
  unit,
  unitHek,
  labelOperasi,
  rows,
}: {
  tajuk: string;
  unit: string;
  unitHek: string;
  labelOperasi: string;
  rows: HasilRow[];
}) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="mb-4 font-semibold">
        {tajuk}{" "}
        <span className="text-sm font-normal text-slate-500">
          — {rows.length} rekod
        </span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-2">Pol/PN</th>
              <th className="p-2">Nama</th>
              <th className="p-2 text-right">Peserta</th>
              <th className="p-2 text-right">Luas (hek)</th>
              <th className="p-2 text-right">{labelOperasi}</th>
              <th className="p-2 text-right">Hasil ({unit})</th>
              <th className="p-2 text-right">{unitHek}</th>
              <th className="p-2 text-right">% Setahun</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2 font-mono text-xs">{r.pol_pn}</td>
                <td className="p-2">{r.nama}</td>
                <td className="p-2 text-right">{formatNombor(r.peserta, 0)}</td>
                <td className="p-2 text-right">{formatNombor(r.luas_hek)}</td>
                <td className="p-2 text-right">
                  {formatNombor(r.luas_operasi)}
                </td>
                <td className="p-2 text-right font-medium">
                  {formatNombor(r.hasil)}
                </td>
                <td className="p-2 text-right">
                  {formatNombor(r.hasil_per_hek)}
                </td>
                <td className="p-2 text-right">
                  {formatNombor(r.pct_setahun)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
