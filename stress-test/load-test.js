// load-test.js — Load test untuk dashboard hasil awam (k6)
// Jalankan: k6 run stress-test/load-test.js
//
// Wajib set env dahulu:
//   export SUPABASE_URL="https://xxxx.supabase.co"
//   export SUPABASE_ANON_KEY="<anon key>"
//
// Skrip ini meniru apa yang dashboard sebenar buat: SELECT semua baris
// hasil_bulanan melalui PostgREST guna kunci anon.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const SUPABASE_URL = __ENV.SUPABASE_URL
const ANON = __ENV.SUPABASE_ANON_KEY
const TARGET_URL = __ENV.TARGET_URL // pilihan: uji halaman Vercel (CDN)

if (!SUPABASE_URL || !ANON) {
  throw new Error('Sila set env SUPABASE_URL dan SUPABASE_ANON_KEY dahulu.')
}

const ralatBukanData = new Rate('ralat_bukan_data')

export const options = {
  scenarios: {
    // Simulasi "ramai-ramai buka": naik beransur 0 -> 50 -> 200 pengguna maya
    ramai_buka: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, // pemanasan
        { duration: '1m', target: 200 }, // puncak
        { duration: '30s', target: 200 }, // tahan beban puncak
        { duration: '20s', target: 0 }, // turun
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // 95% permintaan mesti bawah 800ms
    http_req_duration: ['p(95)<800'],
    // Kadar gagal mesti bawah 1%
    http_req_failed: ['rate<0.01'],
    ralat_bukan_data: ['rate<0.01'],
  },
}

const restHeaders = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  Accept: 'application/json',
}

export default function () {
  // 1) Panggilan utama: ambil data hasil (sama macam dashboard)
  const url = `${SUPABASE_URL}/rest/v1/hasil_bulanan?select=*&order=kod_bulan.asc`
  const res = http.get(url, { headers: restHeaders, tags: { name: 'hasil_bulanan' } })

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'ada data (array)': (r) => typeof r.body === 'string' && r.body.startsWith('['),
    'tak kosong': (r) => typeof r.body === 'string' && r.body.length > 5,
  })
  ralatBukanData.add(!ok)

  // 2) Pilihan: uji halaman awam Vercel (CDN cache)
  if (TARGET_URL) {
    const page = http.get(TARGET_URL, { tags: { name: 'halaman_vercel' } })
    check(page, { 'halaman 200': (r) => r.status === 200 })
  }

  sleep(1) // jeda 1s antara iterasi (meniru pengguna sebenar)
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values['p(95)']
    : 0
  const gagal = data.metrics.http_req_failed
    ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2)
    : '0'
  const ringkasan =
    `\n=== RINGKASAN LOAD TEST ===\n` +
    `p95 tempoh respons : ${p95.toFixed(0)} ms (sasaran < 800 ms)\n` +
    `kadar gagal        : ${gagal}% (sasaran < 1%)\n`
  return {
    stdout: ringkasan,
  }
}
