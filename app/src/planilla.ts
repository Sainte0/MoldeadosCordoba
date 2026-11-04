// Lector de planillas sin dependencias: .xlsx (un ZIP con XML adentro) con DecompressionStream + DOMParser del
// navegador, y .csv. Devuelve cada hoja como filas de celdas (texto o número).
// ponytail: no lee .xls (Excel 97) ni fórmulas sin valor calculado; si aparecen, se pide guardar como .xlsx o CSV.

export type Celda = string | number | null;
export interface Hoja { nombre: string; filas: Celda[][] }

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([datos as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Archivos del ZIP por nombre (lee el directorio central: los tamaños del encabezado local pueden venir en 0). */
async function leerZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let fin = buf.byteLength - 22;
  while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('El archivo no es un Excel válido (.xlsx).');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let i = 0; i < total; i++) {
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const crudo = bytes.subarray(inicio, inicio + comprimido);
    if (/\.xml$|\.rels$/.test(nombre)) archivos.set(nombre, metodo === 8 ? await inflar(crudo) : crudo);
    p += 46 + largoNombre + extra + comentario;
  }
  return archivos;
}

const xml = (b: Uint8Array | undefined) => (b ? new DOMParser().parseFromString(new TextDecoder().decode(b), 'application/xml') : null);
const porTag = (d: Document | Element, tag: string) => Array.from(d.getElementsByTagNameNS('*', tag));
/** "AB12" → índice de columna 27. */
const columna = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

async function leerXlsx(buf: ArrayBuffer): Promise<Hoja[]> {
  const z = await leerZip(buf);
  const compartidos = porTag(xml(z.get('xl/sharedStrings.xml')) ?? new Document(), 'si').map((si) => porTag(si, 't').map((t) => t.textContent ?? '').join(''));
  const libro = xml(z.get('xl/workbook.xml'));
  const rels = xml(z.get('xl/_rels/workbook.xml.rels'));
  if (!libro || !rels) throw new Error('El archivo no es un Excel válido (.xlsx).');
  const destino = new Map(porTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
  return porTag(libro, 'sheet').map((s) => {
    const rid = s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const ruta = (destino.get(rid) ?? '').replace(/^\/?(xl\/)?/, 'xl/');
    const doc = xml(z.get(ruta));
    const filas: Celda[][] = [];
    for (const r of doc ? porTag(doc, 'row') : []) {
      const fila: Celda[] = [];
      for (const c of porTag(r, 'c')) {
        const tipo = c.getAttribute('t');
        const valor = porTag(c, 'v')[0]?.textContent ?? null;
        const i = columna(c.getAttribute('r') ?? '');
        fila[i] = tipo === 's' ? compartidos[Number(valor)] ?? ''
          : tipo === 'inlineStr' ? porTag(c, 't').map((t) => t.textContent).join('')
          : tipo === 'str' || tipo === 'b' ? valor
          : valor === null ? null : Number(valor);
      }
      filas[Number(r.getAttribute('r')) - 1] = Array.from(fila, (x) => x ?? null);
    }
    return { nombre: s.getAttribute('name') ?? 'Hoja', filas: Array.from(filas, (f) => f ?? []) };
  });
}

/** CSV con ; o , (lo detecta en la primera línea) y comillas. */
function leerCsv(texto: string): Hoja[] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: Celda[][] = [];
  let fila: Celda[] = [], campo = '', comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]!;
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return [{ nombre: 'CSV', filas }];
}

export async function leerPlanilla(archivo: File): Promise<Hoja[]> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsv(await archivo.text());
  if (nombre.endsWith('.xls')) throw new Error('Es un Excel viejo (.xls). Abrilo y guardalo como "Libro de Excel (.xlsx)" o como CSV, y subilo de nuevo.');
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede leer .xlsx. Actualizá el iPhone/iPad o guardá la planilla como CSV.');
  return leerXlsx(await archivo.arrayBuffer());
}

/** Excel guarda las fechas como número de días desde 1899-12-30. Lo convertimos si cae en un rango razonable. */
export function fechaExcel(v: Celda): Celda {
  if (typeof v !== 'number' || v < 20000 || v > 80000) return v;
  return new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 10);
}
