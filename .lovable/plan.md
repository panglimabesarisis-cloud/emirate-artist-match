# Rencana: AI Talent Manager — Dubai Edition (bertahap)

PRD ini sangat besar (5 fase, 3 dashboard, AI agent, kredit, booking, review, verifikasi). Membangun semuanya sekaligus akan rapuh, jadi kita mulai dari **Tahap 1 (Marketplace + Fondasi)** yang sudah bisa didemokan, lalu lanjut tahap berikutnya.

## Penyesuaian teknologi (penting)
PRD meminta Laravel + Vue + Redis. Platform ini memakai React (TanStack Start) + Lovable Cloud (database, login, penyimpanan file) + Lovable AI (pengganti OpenAI langsung, tanpa API key). Semua logika bisnis di PRD tetap bisa dipenuhi; hanya teknologinya berbeda. Perintah `php artisan demo:seed` diganti dengan data contoh yang dimasukkan lewat migrasi database.

## Tahap 1 — yang dibangun sekarang
1. **Desain**: arah visual "Dubai malam premium" — latar pasir hangat, aksen emas & biru teluk, font display khas (bukan Inter). Banner tetap "DEMO MODE — no real payments are processed."
2. **Halaman publik (gaya GigSalad)**
   - Beranda: pencarian kategori + emirat/area + jenis acara, kategori populer, artis unggulan, cara kerja.
   - Halaman kategori/subkategori & hasil pencarian dengan URL SEO (`/{category}/{emirate}/{area}`), filter (harga, rating, verified, bahasa, jenis acara) dan urutan.
   - Kartu listing: foto, badge, rating, jumlah booking, harga mulai AED.
   - Profil artis `/artist/{slug}`: media, paket/rate card, review, badge, statistik publik (sesuai pengaturan tampil/sembunyi).
   - Form **Free Quick Quote** (tersimpan ke database; balasan AI masuk Tahap 2).
3. **Login & peran**: Admin, Artis, Klien (tabel peran terpisah, aman).
4. **Dashboard Artis (inti)**: editor profil, media, rate card, kalender ketersediaan, pengaturan visibilitas statistik, pengajuan badge verifikasi (upload dokumen privat).
5. **Dashboard Admin (inti)**: daftar artis + persetujuan, Verification Center, kelola kategori/area/jenis acara.
6. **Data contoh**: 7 emirat, 30 area Dubai, 11 kategori + subkategori, 22 jenis acara, ±24 artis fiktif dengan paket, booking selesai & review (statistik dihitung dari data, bukan diketik).
7. **Bahasa**: Inggris dulu, struktur siap Arab/RTL.

## Tahap berikutnya (setelah Tahap 1 disetujui)
- Tahap 2: AI Booking Agent (Lovable AI + tools deterministik), dompet kredit AI, inbox & handover, contact masking.
- Tahap 3: siklus booking lengkap, invoice VAT 5%/TRN, kontrak, pembayaran demo + escrow, pembatalan, review terverifikasi, Top Performer.
- Tahap 4–5: WhatsApp, Google Calendar, sengketa, tim, ekspor data, Arabic RTL penuh.

## Masukan untuk PRD (yang kurang / perlu diperjelas)
1. **Bagian tahapan tidak realistis untuk MVP** — Fase 1 PRD sudah memuat verifikasi, langganan, 2FA, EN/AR. Sarankan Arabic RTL penuh dan 2FA admin dipindah ke Fase 3–4.
2. **Klien bisa minta quote tanpa akun?** Disebut OTP email, tapi tidak jelas apakah akun klien otomatis dibuat.
3. **Aturan harga paket**: belum ada rumus konkret biaya tambahan (jarak tempuh per km, lembur per jam, biaya akhir pekan/Ramadan). AI butuh angka pasti untuk quote deterministik.
4. **Batas negosiasi AI**: perlu default (mis. diskon maks 10%) dan apa yang terjadi jika klien menawar di bawah batas.
5. **Kebijakan konten budaya UAE**: belum ada aturan moderasi foto/konten (pakaian, tarian) sesuai regulasi lokal.
6. **Komisi & payout**: kapan dana "escrow" dilepas (H+? setelah acara) dan siapa menanggung biaya refund saat sengketa.
7. **Data contoh**: 60 artis + 900 quote + 600 booking terlalu berat untuk demo awal; ±24 artis cukup lalu ditambah.
8. **Multi-tenant**: PRD menyebut multi-tenant SaaS tetapi tidak menjelaskan apakah ada agensi/white-label di MVP — disarankan tegaskan "1 marketplace, tenant = artis".
9. **Metrik KPI** tanpa definisi alat ukur (analytics apa) dan siapa yang memantaunya.
10. **SEO bilingual**: struktur URL Arab (`/ar/...`) dan hreflang belum ditentukan.
11. **Notifikasi**: perlu daftar template email minimum untuk MVP (quote masuk, verifikasi disetujui, dll).
12. **Media artis**: batas ukuran/jumlah video per paket dan apakah video di-hosting sendiri atau tautan YouTube/Instagram.

## Detail teknis
- TanStack Start routes: `/`, `/$category`, `/$category/$emirate`, `/$category/$emirate/$area`, `/artist/$slug`, `/quote/$slug`, `/auth`, `/_authenticated/dashboard/*`, `/_authenticated/admin/*`.
- Lovable Cloud: tabel emirates, areas, categories, subcategories, event_types, artists, artist_media, rate_cards, availability, quote_requests, bookings, reviews, verification_applications, stat_visibility, user_roles (enum admin/artist/client, fungsi `has_role`). RLS di semua tabel; bucket privat untuk dokumen verifikasi.
- Statistik publik dihitung via view/fungsi SQL dari bookings & reviews.
