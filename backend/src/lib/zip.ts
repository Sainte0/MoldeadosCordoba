import { crc32, deflateRawSync } from 'node:zlib';

// .zip mínimo (deflate) con lo que trae Node: alcanza para bajar varios CSV juntos.
// ponytail: todo en memoria; si un día los archivos pesan cientos de MB, pasar a streaming.
export function zip(archivos: { nombre: string; datos: Buffer }[], cuando = new Date()): Buffer {
  // Fecha y hora "de DOS" (la que muestra el explorador de archivos), en hora local del proceso (Argentina).
  const hora = (cuando.getHours() << 11) | (cuando.getMinutes() << 5) | Math.floor(cuando.getSeconds() / 2);
  const dia = ((cuando.getFullYear() - 1980) << 9) | ((cuando.getMonth() + 1) << 5) | cuando.getDate();
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, 'utf8');
    const comprimido = deflateRawSync(a.datos);
    const crc = crc32(a.datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(hora, 10); local.writeUInt16LE(dia, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(a.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12); central.writeUInt16LE(dia, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comprimido.length, 20); central.writeUInt32LE(a.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28); central.writeUInt32LE(offset, 42);
    locales.push(local, nombre, comprimido);
    centrales.push(central, nombre);
    offset += 30 + nombre.length + comprimido.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}
