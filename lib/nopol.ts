// Normalisasi nomor polisi untuk pencocokan lintas-format:
// "KT 8154 NJ" / "KT-8154-NJ" / "kt8154nj" -> "KT8154NJ"
export function normalizeNopol(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toString().toUpperCase().replace(/[\s\-.]/g, "").trim();
}

// Plat KT / Non KT ditentukan otomatis dari 2 huruf depan nomor polisi ternormalisasi.
export function platFromNopol(raw: string | null | undefined): "KT" | "Non KT" {
  const norm = normalizeNopol(raw);
  return norm.startsWith("KT") ? "KT" : "Non KT";
}
