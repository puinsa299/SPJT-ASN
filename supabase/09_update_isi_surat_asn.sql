-- ============================================================================
-- 09_update_isi_surat_asn.sql — jalankan sekali untuk update isi surat & lampiran
-- ke format baru (sesuai contoh SPJT_RSUD_IA_MOEIS_Kota_Samarinda.docx)
-- ============================================================================

update pengaturan_template
set
  isi_surat = 'Berdasarkan basis data kendaraan bermotor yang telah kami inventarisasi, terdapat kendaraan bermotor Aparatur Sipil Negara (ASN) yang bekerja pada Instansi Saudara sebagaimana tercantum dalam lampiran surat ini yang akan segera memasuki masa jatuh tempo pembayaran Pajak Kendaraan Bermotor (PKB). Sehubungan dengan hal tersebut, kami mengimbau agar pembayaran PKB dapat dilakukan tepat waktu guna menghindari sanksi administratif sesuai ketentuan yang berlaku. Pembayaran PKB dapat dilakukan melalui Kantor Samsat Induk Samarinda sesuai dengan jadwal pelayanan yang berlaku.

Adapun informasi mengenai besaran pajak yang harus dibayarkan dapat diakses melalui laman http://simpator.kaltimprov.go.id atau melakukan konfirmasi kepada Bagian Penetapan pada Kantor Samsat terdekat.

Apabila terdapat kendaraan sebagaimana tercantum dalam lampiran yang telah dialihkan kepemilikannya, kami mohon kesediaan Saudara untuk menyampaikan tanggapan melalui surat balasan disertai informasi pendukung yang diperlukan. Konfirmasi dapat disampaikan kepada Bagian Penetapan UPTD PPRD Wilayah Samarinda melalui nomor whatsapp: 0815-2842-4696 (Maulida), sehingga data kendaraan dapat dilakukan verifikasi dan pemutakhiran.

Demikian surat ini kami sampaikan, atas perhatian dan kerjasamanya diucapkan terima kasih.',
  lampiran_teks = '1 (satu) lembar';
