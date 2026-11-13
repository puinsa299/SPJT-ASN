// Pembaca .xlsx hemat memori untuk file RAKSASA (mis. 220 MB berisi sheet dengan 750 ribu baris).
// Hanya sheet yang diminta (dan tabel teks bersama) yang dibuka; sheet lain tidak pernah dibongkar.
import { unzip, Unzip, UnzipInflate } from "fflate";

const dec = new TextDecoder("utf-8");

function buka(data: Uint8Array, nama: string[]): Promise<Record<string, Uint8Array>> {
  const mau = new Set(nama);
  return new Promise((resolve, reject) => {
    unzip(data, { filter: (f) => mau.has(f.name) }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

const entitas = (s: string) =>
  s.indexOf("&") < 0
    ? s
    : s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");

function kolomKeIndeks(huruf: string): number {
  let n = 0;
  for (let i = 0; i < huruf.length; i++) n = n * 26 + (huruf.charCodeAt(i) - 64);
  return n - 1;
}

function teksSi(si: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(si))) out += m[1];
  return entitas(out);
}

export async function daftarSheet(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const f = await buka(data, ["xl/workbook.xml"]);
  const wb = dec.decode(f["xl/workbook.xml"]);
  return Array.from(wb.matchAll(/<sheet\s[^>]*?name="([^"]*)"/g)).map((m) => entitas(m[1]));
}

// Mengembalikan baris-baris sheet (array of array, kolom A = indeks 0) untuk sheet yang namanya cocok.
export async function bacaSheetBesar(
  file: File,
  pilih: (nama: string[]) => string | undefined
): Promise<{ nama: string; baris: unknown[][] }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const awal = await buka(data, ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]);
  const wb = dec.decode(awal["xl/workbook.xml"]);
  const rels = dec.decode(awal["xl/_rels/workbook.xml.rels"]);

  const sheets = Array.from(wb.matchAll(/<sheet\s([^>]*?)\/>/g)).map((m) => {
    const a = m[1];
    return {
      nama: entitas(/name="([^"]*)"/.exec(a)?.[1] ?? ""),
      rid: /r:id="([^"]*)"/.exec(a)?.[1] ?? "",
    };
  });
  const terpilih = pilih(sheets.map((s) => s.nama));
  const sh = sheets.find((s) => s.nama === terpilih) ?? sheets[0];
  if (!sh) throw new Error("Sheet tidak ditemukan di file.");

  const relTag = Array.from(rels.matchAll(/<Relationship\s([^>]*?)\/>/g)).find((m) => new RegExp(`Id="${sh.rid}"`).test(m[1]));
  let target = relTag ? /Target="([^"]*)"/.exec(relTag[1])?.[1] ?? "" : "";
  target = target.replace(/^\//, "");
  const path = target.startsWith("xl/") ? target : `xl/${target}`;

  // ---- 1. baca sheet secara BERTAHAP (stream) dan berhenti di baris data terakhir ----
  // File ekspor Excel kadang berisi jutaan baris "kosong" berisi angka 0 di bawah data sebenarnya
  // (tabel diperpanjang sampai baris 1.048.576). Baris tanpa isi di kolom A-C dianggap kosong,
  // dan pembacaan dihentikan setelah 1000 baris kosong berturut-turut.
  type Sel = { r: number; c: number; t: string; v: string };
  const sel: Sel[] = [];
  const perlu = new Set<number>();
  const reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const proses = (isiBaris: string): boolean => {
    // mengembalikan true bila baris ini berisi data
    const sementara: Sel[] = [];
    let adaData = false;
    reC.lastIndex = 0;
    let mc: RegExpExecArray | null;
    while ((mc = reC.exec(isiBaris))) {
      const attr = mc[1];
      const body = mc[2] ?? "";
      const ref = /\br="([A-Z]+)(\d+)"/.exec(attr);
      if (!ref) continue;
      const t = /\bt="([^"]*)"/.exec(attr)?.[1] ?? "n";
      let v = "";
      if (t === "inlineStr") v = teksSi(body);
      else {
        const mv = /<v>([\s\S]*?)<\/v>/.exec(body);
        if (!mv) continue;
        v = mv[1];
      }
      const c = kolomKeIndeks(ref[1]);
      if (c <= 2 && v !== "") adaData = true;
      sementara.push({ r: parseInt(ref[2], 10) - 1, c, t, v });
    }
    if (adaData) {
      for (const x of sementara) {
        if (x.t === "s") perlu.add(parseInt(x.v, 10));
        sel.push(x);
      }
    }
    return adaData;
  };

  await new Promise<void>((resolve, reject) => {
    const uz = new Unzip();
    uz.register(UnzipInflate);
    let ditemukan = false;
    uz.onfile = (f) => {
      if (f.name !== path) return;
      ditemukan = true;
      const dek = new TextDecoder("utf-8");
      let sisa = "";
      let kosongBerturut = 0;
      let selesai = false;
      f.ondata = (err, chunk, final) => {
        if (err) return reject(err);
        if (selesai) return;
        sisa += dek.decode(chunk, { stream: !final });
        const reRow = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
        let akhir = 0;
        let m: RegExpExecArray | null;
        while ((m = reRow.exec(sisa))) {
          akhir = reRow.lastIndex;
          if (proses(m[1] ?? "")) kosongBerturut = 0;
          else if (++kosongBerturut >= 1000 && sel.length > 0) {
            selesai = true;
            f.terminate();
            resolve();
            return;
          }
        }
        sisa = sisa.slice(akhir);
        if (final) resolve();
      };
      f.start();
    };
    try {
      uz.push(data, true);
    } catch (e) {
      reject(e);
      return;
    }
    if (!ditemukan) reject(new Error(`Isi sheet "${sh.nama}" tidak ditemukan di file.`));
  });

  const isi = await buka(data, ["xl/sharedStrings.xml"]);

  // ---- 2. ambil hanya teks bersama yang diperlukan (tabel teks bisa 100+ MB) ----
  const teks = new Map<number, string>();
  const ss = isi["xl/sharedStrings.xml"];
  if (perlu.size > 0 && ss) {
    const s = dec.decode(ss);
    const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
    let i = 0;
    let m: RegExpExecArray | null;
    let sisa = perlu.size;
    while ((m = re.exec(s))) {
      if (perlu.has(i)) {
        teks.set(i, m[1] === undefined ? "" : teksSi(m[1]));
        if (--sisa === 0) break;
      }
      i++;
    }
  }

  // ---- 3. susun baris ----
  const baris: unknown[][] = [];
  for (const x of sel) {
    let nilai: unknown;
    if (x.t === "s") nilai = teks.get(parseInt(x.v, 10)) ?? "";
    else if (x.t === "str" || x.t === "inlineStr") nilai = entitas(x.v);
    else if (x.t === "b") nilai = x.v === "1";
    else if (x.t === "e") nilai = null;
    else if (x.t === "d") nilai = x.v;
    else {
      const n = Number(x.v);
      nilai = Number.isNaN(n) ? x.v : n;
    }
    (baris[x.r] ??= [])[x.c] = nilai;
  }
  const rapi: unknown[][] = [];
  for (let r = 0; r < baris.length; r++) if (baris[r]) rapi.push(Array.from(baris[r], (v) => (v === undefined ? null : v)));
  return { nama: sh.nama, baris: rapi };
}
