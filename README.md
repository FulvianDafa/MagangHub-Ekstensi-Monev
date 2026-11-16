# Draf Monev MagangHub

Ekstensi Brave dan Chrome untuk menyusun tiga kolom laporan harian dari satu ringkasan kegiatan dengan Gemini, meninjau draf, dan memasukkannya ke formulir Monev.

## Pasang

1. Di GitHub, pilih **Code → Download ZIP** dan ekstrak ZIP. Buka `brave://extensions` di Brave atau `chrome://extensions` di Chrome.
2. Aktifkan **Developer mode** dan klik **Load unpacked**. Pilih folder hasil ekstrak yang langsung berisi `manifest.json`.
3. Buka ekstensi, pilih **Pengaturan**, lalu simpan API key dari [Google AI Studio](https://aistudio.google.com/apikey). API key tersimpan pada profil browser ini. Saat kamu memilih **Buat draf dengan Gemini**, ringkasanmu dikirim langsung ke layanan Gemini.

Jika versi 1.0 sudah terpasang, salin isi folder baru ke folder lama yang dipilih saat **Load unpacked**. Klik **Reload** pada ekstensi lalu muat ulang tab Monev. Memakai folder pemasangan yang sama mempertahankan akses ke draf lama.

## Pakai

1. Di Monev, buka **Riwayat → pilih tanggal → Tambah laporan**. Buka ekstensi. Tanggal mengikuti formulir yang kamu buka dan bisa dipilih sendiri jika kamu menyiapkan draf lebih dulu.
2. Tulis ringkasan kegiatan, pembelajaran, dan kendala. Contoh: **Saya ikut pengenalan tim QA, belajar alur pencatatan bug, dan sempat menunggu akses Jira.** Pilih **Tidak ada kendala** jika itu sesuai dengan kegiatanmu.
3. Klik **Buat draf dengan Gemini** dan tinjau tiga kolom yang dihasilkan. Lengkapi informasi yang kurang sampai setiap kolom mencapai 100 karakter. Klik **Isi sekarang** untuk menyalin ketiganya ke formulir Monev. Jika sudah ada teks yang berbeda, ekstensi meminta izin untuk menggantinya.
4. Jika menyiapkan laporan terlebih dahulu, centang **Isi otomatis saat formulir dibuka** lalu klik **Simpan draf**. Ekstensi akan mengisi formulir pada tanggal tersebut saat halaman dibuka dan ketiga kolom siap.
5. Tinjau hasil, isi kehadiran, centang pernyataan, lalu klik **Simpan dan Kirim** dari situs Monev.

Draf disimpan pada profil browser per tanggal. Kosongkan tiga kolom lalu klik **Simpan draf** untuk menghapus draf pada tanggal yang dipilih.
