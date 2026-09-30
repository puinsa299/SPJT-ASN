// Membersihkan nama orang dari data mentah Samsat:
// - buang koma, rapikan spasi berlebih
// - kata biasa -> Proper Case (huruf awal kapital)
// - kata yang cocok dengan daftar gelar akademik -> diformat pakai titik yang benar
// - gelar berurutan dipisah koma ("S.Psi., M.Psi."), dan koma ditambahkan
//   di antara NAMA dan gelar pertama ("Ruskhannu, S.E.") — tapi TIDAK dikasih koma
//   kalau gelarnya di depan nama (gelar seperti Dr./Ir./H. yang jadi titel depan,
//   contoh: "Dr. Ahmad" bukan "Dr., Ahmad")
//
// Contoh: "RUSKHANNU SE" -> "Ruskhannu, S.E."
//         "FEBRIANNISA S.PSI M.PSI" -> "Febriannisa, S.Psi., M.Psi."

const GELAR_MAP: Record<string, string> = {
  // gelar sarjana (S1)
  se: "S.E.", sh: "S.H.", st: "S.T.", skom: "S.Kom.", spsi: "S.Psi.",
  ssos: "S.Sos.", spd: "S.Pd.", sip: "S.IP", ssi: "S.Si.", sag: "S.Ag.",
  sfarm: "S.Farm.", shut: "S.Hut.", spt: "S.Pt.", sked: "S.Ked.",
  spar: "S.Par.", ssn: "S.Sn.", ptr: "S.Tr.", sap: "S.AP",
  strip: "S.Tr.IP",
  // gelar magister (S2)
  mm: "M.M.", mpsi: "M.Psi.", mh: "M.H.", msi: "M.Si.", mkom: "M.Kom.",
  map: "M.AP", mpd: "M.Pd.", mt: "M.T.", mba: "M.B.A.", mpa: "M.PA",
  mars: "M.ARS", mkes: "M.Kes.", mak: "M.Ak.",
  // gelar lain / titel depan nama
  ak: "Ak.", cpa: "CPA", dr: "Dr.", ir: "Ir.", drs: "Drs.", dra: "Dra.",
  prof: "Prof.", hj: "Hj.", h: "H.",
};

function stripKey(word: string): string {
  return word.replace(/\./g, "").toLowerCase();
}

type Part = { type: "name" | "gelar"; text: string };

export function toProperCase(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const words = cleaned.split(" ");
  const parts: Part[] = [];
  let pendingGelar: string[] = [];

  const flushGelar = () => {
    if (pendingGelar.length > 0) {
      parts.push({ type: "gelar", text: pendingGelar.join(", ") });
      pendingGelar = [];
    }
  };

  for (const word of words) {
    const key = stripKey(word);
    if (GELAR_MAP[key]) {
      pendingGelar.push(GELAR_MAP[key]);
    } else {
      flushGelar();
      parts.push({ type: "name", text: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() });
    }
  }
  flushGelar();

  // Gabungkan: koma HANYA saat transisi nama -> gelar (gelar sebagai suffix).
  // Transisi gelar -> nama (gelar sebagai prefix/titel depan) tetap pakai spasi biasa.
  let result = "";
  parts.forEach((part, i) => {
    if (i === 0) {
      result = part.text;
      return;
    }
    const prev = parts[i - 1];
    const separator = prev.type === "name" && part.type === "gelar" ? ", " : " ";
    result += separator + part.text;
  });

  return result;
}
