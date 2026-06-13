# Stress Test — Dashboard Hasil Awam

Dua jenis ujian untuk dashboard awam (`hasil_bulanan` via Supabase anon):

| Fail | Tujuan | Soalan dijawab |
|------|--------|----------------|
| `load-test.js` | **Load test** (k6) | "Kalau ramai-ramai buka serentak, sistem tahan tak?" |
| `security-test.mjs` | **Ujian keselamatan RLS** (Node) | "Boleh ke orang anon hack / curi / ubah data sensitif?" |

---

## ⚠️ AMARAN

- **Jangan** jalankan load test berat ke production waktu puncak. Guna bilangan pengguna rendah dulu, atau jalankan waktu malam.
- Load test yang terlalu agresif boleh guna kuota Supabase / Vercel anda.
- Mula dengan `target` rendah (cth 20 VU), naikkan sikit-sikit.

---

## Pemboleh ubah persekitaran (env)

Kedua-dua skrip baca nilai ini dari env — **jangan hardcode** dalam fail:

```bash
export SUPABASE_URL="https://lbklwflwiujdnuricxbt.supabase.co"
export SUPABASE_ANON_KEY="<anon key dari Supabase > Settings > API>"
export TARGET_URL="https://dashboard-hasil.vercel.app"   # pilihan, untuk uji CDN
```

---

## 1. Load test (k6)

### Pasang k6
```bash
# macOS
brew install k6
# Linux (Debian/Ubuntu)
sudo apt-get install k6
# atau lihat https://k6.io/docs/get-started/installation/
```

### Jalankan
```bash
k6 run stress-test/load-test.js
```

Skrip ini menaikkan pengguna maya (VU) secara berperingkat: 0 → 50 → 200 → 0, sambil memanggil endpoint REST `hasil_bulanan` (sama macam dashboard sebenar).

### Lulus / Gagal (thresholds)
- `http_req_duration p(95) < 800ms` — 95% permintaan kena bawah 0.8 saat.
- `http_req_failed rate < 1%` — kurang 1% gagal.

Kalau threshold gagal, k6 keluar dengan kod bukan-sifar dan tunjuk metrik mana yang lemah.

---

## 2. Ujian keselamatan RLS (Node 18+)

### Jalankan
```bash
node stress-test/security-test.mjs
```

Skrip ini menyamar sebagai pengguna **anon** (tanpa login) dan cuba pelbagai serangan biasa:

| Ujian | Jangkaan |
|-------|----------|
| Baca `hasil_bulanan` | ✅ DIBENARKAN (memang awam) |
| INSERT / UPDATE / DELETE `hasil_bulanan` | ❌ DISEKAT |
| Baca semua `pengguna` (bocor nama/emel) | ❌ kosong / disekat |
| Baca `audit` tanpa token kongsi | ❌ kosong / disekat |
| Baca `activity_log` / `bank_jawapan` | ❌ kosong / disekat |

Skrip cetak ringkasan **LULUS / GAGAL** untuk setiap ujian. Kalau semua LULUS, RLS anda kukuh terhadap akses anon.

> Nota: PostgREST memulangkan `[]` (kosong) bila RLS menapis semua baris — ini dikira **LULUS** (data tak bocor), bukan ralat.
