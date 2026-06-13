// security-test.mjs — Ujian keselamatan RLS sebagai pengguna anon (tanpa login)
// Jalankan: node stress-test/security-test.mjs   (Node 18+)
//
// Wajib set env dahulu:
//   export SUPABASE_URL="https://xxxx.supabase.co"
//   export SUPABASE_ANON_KEY="<anon key>"
//
// Skrip ini menyamar sebagai penyerang anon dan cuba:
//   - baca data sensitif (pengguna, audit, log)
//   - tulis/ubah/padam data awam (hasil_bulanan)
// Ia LULUS jika RLS menyekat semua perkara yang sepatutnya disekat.

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY

if (!URL || !ANON) {
  console.error('Sila set env SUPABASE_URL dan SUPABASE_ANON_KEY dahulu.')
  process.exit(1)
}

const H = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  'Content-Type': 'application/json',
}

const keputusan = []
function lapor(nama, lulus, butiran) {
  keputusan.push({ nama, lulus })
  const tanda = lulus ? '\x1b[32mLULUS\x1b[0m' : '\x1b[31mGAGAL\x1b[0m'
  console.log(`[${tanda}] ${nama}${butiran ? ' — ' + butiran : ''}`)
}

async function tryFetch(path, opts = {}) {
  try {
    const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H, ...opts })
    let body = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { status: res.status, body }
  } catch (e) {
    return { status: 0, body: null, error: String(e) }
  }
}

function kosong(body) {
  return Array.isArray(body) && body.length === 0
}

async function main() {
  console.log('=== UJIAN KESELAMATAN RLS (anon) ===\n')

  // 1) Baca hasil_bulanan — SEPATUTNYA dibenarkan (dashboard awam)
  {
    const r = await tryFetch('hasil_bulanan?select=*&limit=1')
    lapor(
      'Baca hasil_bulanan (awam)',
      r.status === 200 && Array.isArray(r.body) && r.body.length > 0,
      `status ${r.status}`
    )
  }

  // 2) INSERT hasil_bulanan — SEPATUTNYA disekat
  {
    const r = await tryFetch('hasil_bulanan', {
      method: 'POST',
      body: JSON.stringify({
        kod_bulan: '9999-99',
        nama_bulan: 'HACK',
        jenis: 'sawit',
        pol_pn: 'HACK',
        nama: 'HACK',
        hasil: 0,
      }),
    })
    lapor('Sekat INSERT hasil_bulanan', r.status >= 400, `status ${r.status}`)
  }

  // 3) UPDATE hasil_bulanan — SEPATUTNYA disekat
  {
    const r = await tryFetch('hasil_bulanan?kod_bulan=eq.2026-01', {
      method: 'PATCH',
      body: JSON.stringify({ hasil: 999999 }),
    })
    // 400/401/403 = disekat. 200 dengan [] juga bermakna tiada baris terkesan.
    const lulus = r.status >= 400 || kosong(r.body)
    lapor('Sekat UPDATE hasil_bulanan', lulus, `status ${r.status}`)
  }

  // 4) DELETE hasil_bulanan — SEPATUTNYA disekat
  {
    const r = await tryFetch('hasil_bulanan?kod_bulan=eq.2026-01', {
      method: 'DELETE',
    })
    const lulus = r.status >= 400 || kosong(r.body)
    lapor('Sekat DELETE hasil_bulanan', lulus, `status ${r.status}`)
  }

  // 5) Baca semua pengguna (bocor nama/emel) — SEPATUTNYA kosong/disekat
  {
    const r = await tryFetch('pengguna?select=*')
    const lulus = r.status >= 400 || kosong(r.body)
    lapor(
      'Sekat baca senarai pengguna',
      lulus,
      `status ${r.status}, ${Array.isArray(r.body) ? r.body.length : '?'} baris`
    )
  }

  // 6) Baca audit tanpa token kongsi — SEPATUTNYA kosong/disekat
  {
    const r = await tryFetch('audit?select=*')
    const lulus = r.status >= 400 || kosong(r.body)
    lapor(
      'Sekat baca audit tanpa kongsi',
      lulus,
      `status ${r.status}, ${Array.isArray(r.body) ? r.body.length : '?'} baris`
    )
  }

  // 7) Baca log aktiviti — SEPATUTNYA kosong/disekat
  {
    const r = await tryFetch('activity_log?select=*')
    const lulus = r.status >= 400 || kosong(r.body)
    lapor('Sekat baca activity_log', lulus, `status ${r.status}`)
  }

  // 8) Baca bank_jawapan — SEPATUTNYA kosong/disekat
  {
    const r = await tryFetch('bank_jawapan?select=*')
    const lulus = r.status >= 400 || kosong(r.body)
    lapor('Sekat baca bank_jawapan', lulus, `status ${r.status}`)
  }

  // Ringkasan
  const gagal = keputusan.filter((k) => !k.lulus).length
  console.log('\n=== RINGKASAN ===')
  console.log(`Jumlah ujian : ${keputusan.length}`)
  console.log(`Lulus        : ${keputusan.length - gagal}`)
  console.log(`Gagal        : ${gagal}`)
  if (gagal > 0) {
    console.log(
      '\n\x1b[31m⚠️  Ada ujian GAGAL — semak polisi RLS untuk jadual berkenaan.\x1b[0m'
    )
    process.exit(1)
  } else {
    console.log('\n\x1b[32m✅ Semua ujian LULUS — RLS kukuh terhadap akses anon.\x1b[0m')
  }
}

main()
