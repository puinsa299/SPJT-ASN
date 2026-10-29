// Helper parsing nilai sel Excel (via ExcelJS) yang formatnya bisa macam-macam:
// Date object asli, serial number Excel, atau string "dd/mm/yyyy" dst.

export function cellToDateString(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    // Serial date Excel (basis 1899-12-30)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    // coba format dd/mm/yyyy atau dd-mm-yyyy
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const [, d, mo, y] = m;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // coba parse langsung (format ISO dsb)
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }

  // object hasil formula ExcelJS { result: ... }
  if (typeof value === "object" && "result" in value) {
    return cellToDateString(value.result);
  }

  return null;
}

export function cellToNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "result" in value) return cellToNumber(value.result);
  if (typeof value === "string") {
    // buang "Rp", spasi, titik ribuan; koma jadi titik desimal
    const cleaned = value.replace(/[Rr]p/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function cellToString(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "result" in value) return cellToString(value.result);
  return value.toString().trim();
}
