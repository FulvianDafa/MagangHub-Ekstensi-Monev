# Draf Monev MagangHub

Ekstensi Brave dan Chrome untuk menyusun tiga kolom laporan harian dari satu ringkasan kegiatan dengan Gemini, meninjau draf, dan memasukkannya ke formulir Monev.

## Struktur proyek

```
manifest.json          Wajib di root pada Manifest V3
package.json           Skrip cek sintaks dan test, tidak dimuat browser
icons/                 Ikon 16, 32, 48, dan 128 px
src/
  lib/
    monev-report.js    MonevReport: daftar bidang, tanggal, dan pengisian kolom
    gemini.js          MonevGemini: klien Gemini dan penyimpanan API key
  content/
    auto-fill.js       Content script pengisi formulir otomatis
  popup/
    popup.html         Antarmuka popup
    popup.css          Gaya popup
    popup.js           Logika popup
test/
  monev-report.test.mjs  Test aturan tanggal, alamat halaman, dan panjang kolom
.github/workflows/ci.yml Cek sintaks dan test pada setiap push
```

`src/lib/monev-report.js` dimuat di dua tempat: sebagai content script di halaman Monev dan sebagai skrip popup. `manifest.json` tidak bisa dipindahkan dari root.

Kedua modul di `src/lib` sengaja berupa IIFE yang mengisi variabel global, bukan modul ESM. `content_scripts` pada Manifest V3 tidak menerima `type: "module"`, jadi mengubahnya menjadi `import`/`export` akan mematahkan pengisian otomatis.

## Kembangkan

```bash
npm run check   # cek sintaks keempat berkas JS
npm test        # jalankan test aturan tanggal, alamat, dan panjang kolom
```

Tidak ada dependency dan tidak ada proses build. Yang dimuat browser adalah isi folder ini apa adanya.

## Pasang

1. Di GitHub, pilih **Code → Download ZIP** dan ekstrak ZIP. Buka `brave://extensions` di Brave atau `chrome://extensions` di Chrome.
2. Aktifkan **Developer mode** dan klik **Load unpacked**. Pilih folder hasil ekstrak yang langsung berisi `manifest.json`.
3. Buka ekstensi, pilih **Pengaturan**, lalu simpan API key dari [Google AI Studio](https://aistudio.google.com/apikey). API key tersimpan pada profil browser ini dan disembunyikan saat Pengaturan dibuka. Gunakan **Tampilkan** atau **Sembunyikan** untuk mengatur visibilitasnya. Saat kamu memilih **Buat draf dengan Gemini**, ringkasanmu dikirim langsung ke layanan Gemini.

Jika versi sebelumnya sudah terpasang, salin isi folder baru ke folder lama yang dipilih saat **Load unpacked**. Klik **Reload** pada ekstensi lalu muat ulang tab Monev. Memakai folder pemasangan yang sama mempertahankan akses ke draf lama. Karena berkas sumber kini berada di `src/`, folder pemasangan lama menyisakan berkas di root; berkas itu tidak lagi dirujuk manifest dan boleh dihapus.

## Pakai

1. Di Monev, buka **Riwayat → pilih tanggal → Tambah laporan**. Buka ekstensi. Tanggal mengikuti formulir yang kamu buka dan bisa dipilih sendiri jika kamu menyiapkan draf lebih dulu. Tombol **Dashboard** di header ekstensi membuka halaman Monev di tab baru, jadi kamu tidak perlu mengetik alamatnya sendiri.
2. Tulis ringkasan kegiatan, pembelajaran, dan kendala. Contoh: **Saya ikut pengenalan tim QA, belajar alur pencatatan bug, dan sempat menunggu akses Jira.** Pilih **Tidak ada kendala** jika itu sesuai dengan kegiatanmu.
3. Klik **Buat draf dengan Gemini** dan tinjau tiga kolom yang dihasilkan. Lengkapi informasi yang kurang sampai setiap kolom mencapai 100 karakter. Klik **Isi sekarang** untuk menyalin ketiganya ke formulir Monev. Jika sudah ada teks yang berbeda, ekstensi meminta izin untuk menggantinya.
4. Jika menyiapkan laporan terlebih dahulu, centang **Isi otomatis saat formulir dibuka** lalu klik **Simpan draf**. Ekstensi akan mengisi formulir pada tanggal tersebut saat halaman dibuka dan ketiga kolom siap.
5. Tinjau hasil, isi kehadiran, centang pernyataan, lalu klik **Simpan dan Kirim** dari situs Monev.

Draf disimpan pada profil browser per tanggal. Untuk mengosongkan ringkasan dan tiga kolom draf pada tanggal aktif, klik **Reset draf** dari **Tulis laporan** atau **Draf laporan**, lalu konfirmasi. Untuk menghapus draf pada seluruh tanggal sekaligus, buka **Pengaturan → Hapus semua draf**; tombol itu perlu diklik dua kali sebagai konfirmasi.

## Batasan

- Butuh API key Gemini milik sendiri. Ekstensi tidak menyediakan key bersama.
- API key disimpan pada profil browser ini dan dipanggil langsung dari browser, tanpa server perantara.
- Pengisian otomatis hanya mengenali halaman **Riwayat** dengan parameter `view=edit`.
- Nama model Gemini tertulis di `src/lib/gemini.js`. Kalau Google menghentikannya, ekstensi menampilkan pesan untuk memperbarui versi.
- Butuh Chrome atau Brave 103 ke atas, sesuai `minimum_chrome_version` di manifest.
