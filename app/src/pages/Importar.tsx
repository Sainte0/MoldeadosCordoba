import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api, hoy, verFecha } from '../api';
import { normalizar, useDemorado } from '../filtros';
import { fechaExcel, leerPlanilla, type Celda, type Hoja } from '../planilla';
import { Asistente, Aviso, Campo, Cargando, Entrada, Opciones, type Paso } from '../ui';

interface Campo { id: string; titulo: string; obligatorio?: boolean; ejemplo: string; parecidos: string[] }
interface Tipo { id: string; titulo: string; campos: Campo[] }
interface Resultado { nuevos: number; actualizados: number; sinCambios: number; errores: { fila: number; mensaje: string }[]; importado: boolean }

const DESTINO: Record<string, string> = { clientes: '/clientes', proveedores: '/proveedores', stock: '/materia-prima', 'saldos-clientes': '/cuentas', 'saldos-proveedores': '/cuentas?de=proveedor', precios: '/precios', egresos: '/egresos', ventas: '/ventas' };
const AYUDA: Record<string, string> = {
  ventas: 'La hoja VENTAS de la planilla de finanzas: fecha, comprobante, calidad, cantidad, precio, monto, lo pagado en efectivo, transferencia y cheque, estado y observaciones. Entran sin palet (no tocan el stock) y lo pagado queda en el saldo de cada cliente.',
  egresos: 'La hoja EGRESOS de la planilla de finanzas, tal cual: fecha, comprobante, proveedor / beneficiario, concepto, categoría, forma de pago, monto, USD, estado y observaciones. Los pendientes quedan para pagar.',
  clientes: 'Si un cliente ya existe (mismo nombre), no se duplica.',
  proveedores: 'Si un proveedor ya existe (mismo nombre), no se duplica.',
  stock: 'Deja el stock en lo que dice la planilla. Si la volvés a subir, no suma dos veces: corrige la diferencia.',
  'saldos-clientes': 'Lo que cada cliente debía el día que arrancan con el sistema. Si un cliente no existe, se crea.',
  'saldos-proveedores': 'Lo que se le debía a cada proveedor el día que arrancan con el sistema. Si no existe, se crea.',
  precios: 'Precio por maple, sin IVA, según el código. Los códigos tienen que existir en Ajustes › Maples y máquinas.',
};

/** Planilla modelo: los títulos que reconoce el sistema y un ejemplo, en CSV (abre en Excel). */
function bajarModelo(t: Tipo) {
  const linea = (xs: string[]) => xs.map((x) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(';');
  const csv = '﻿' + [linea(t.campos.map((c) => c.titulo)), linea(t.campos.map((c) => c.ejemplo))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: `modelo-${t.id}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** La primera fila con al menos dos textos es la de títulos (las planillas suelen tener un título arriba). */
const filaTitulos = (h: Hoja) => Math.max(0, h.filas.findIndex((f) => f.filter((c) => typeof c === 'string' && c.trim()).length >= 2));

/** Para cada dato, la columna cuyo título se parece más. */
function proponer(campos: Campo[], titulos: string[]): Record<string, number> {
  const t = titulos.map((x) => normalizar(String(x ?? '')).trim());
  const usadas = new Set<number>();
  const out: Record<string, number> = {};
  for (const c of campos) {
    const opciones = [c.titulo, ...c.parecidos].map((p) => normalizar(p));
    let i = t.findIndex((x, k) => !usadas.has(k) && opciones.includes(x));
    if (i < 0) i = t.findIndex((x, k) => !usadas.has(k) && x && opciones.some((o) => x.includes(o) || o.includes(x)));
    if (i >= 0) { out[c.id] = i; usadas.add(i); }
  }
  return out;
}

export function Importar() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: tipos, isLoading } = useQuery({ queryKey: ['importar'], queryFn: () => api<Tipo[]>('/importar') });
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hojaI, setHojaI] = useState(0);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [actualizar, setActualizar] = useState(false);
  const [fecha, setFecha] = useState(hoy());
  const [prueba, setPrueba] = useState<Resultado | null>(null);
  const [probando, setProbando] = useState(false);
  const [final, setFinal] = useState<Resultado | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tipo = tipos?.find((t) => t.id === tipoId);
  const hoja = hojas[hojaI];
  const h = hoja ? filaTitulos(hoja) : 0;
  const titulos = (hoja?.filas[h] ?? []).map((c, i) => (c === null || c === '' ? `Columna ${i + 1}` : String(c)));

  useEffect(() => { if (tipo && hoja) setMapa(proponer(tipo.campos, titulos)); }, [tipoId, hojaI, hojas]); // eslint-disable-line react-hooks/exhaustive-deps

  const filas = useMemo(() => {
    if (!tipo || !hoja) return [];
    return hoja.filas.slice(h + 1)
      .map((f, i) => ({ f, n: h + i + 2 }))
      .filter(({ f }) => f.some((c) => c !== null && String(c).trim() !== ''))
      .map(({ f, n }) => {
        const o: Record<string, Celda> = { _fila: n };
        for (const c of tipo.campos) if (mapa[c.id] !== undefined) o[c.id] = c.id === 'fecha' ? fechaExcel(f[mapa[c.id]!] ?? null) : f[mapa[c.id]!] ?? null;
        return o;
      });
  }, [tipo, hoja, h, mapa]);
  const faltan = tipo?.campos.filter((c) => c.obligatorio && mapa[c.id] === undefined) ?? [];
  const tieneFecha = !!tipo?.campos.some((c) => c.id === 'fecha');

  // Revisión en seco cada vez que cambia lo que se va a importar (no guarda nada).
  const clavePrueba = useDemorado(JSON.stringify([tipoId, filas, actualizar, fecha]), 400);
  useEffect(() => {
    setPrueba(null);
    if (!tipo || !filas.length || faltan.length) return;
    setProbando(true);
    api<Resultado>(`/importar/${tipo.id}`, { method: 'POST', body: { modo: 'probar', filas, actualizar, fecha } })
      .then(setPrueba).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo revisar')).finally(() => setProbando(false));
  }, [clavePrueba]); // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setErrorArchivo(null);
    try {
      const hs = (await leerPlanilla(f)).filter((x) => x.filas.some((r) => r.some((c) => c !== null && c !== '')));
      if (!hs.length) throw new Error('La planilla está vacía.');
      setHojas(hs); setHojaI(0); setArchivo(f.name);
    } catch (e) {
      setHojas([]); setArchivo(null);
      setErrorArchivo(e instanceof Error ? e.message : 'No pudimos leer el archivo.');
    }
  };

  if (final) {
    return (
      <div className="columna" style={{ display: 'grid', gap: 20 }}>
        <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Importación terminada.</div>
        <div className="cifras">
          <div><span className="cifra">{final.nuevos}</span><small>nuevos</small></div>
          <div><span className="cifra">{final.actualizados}</span><small>actualizados</small></div>
          <div><span className="cifra">{final.sinCambios}</span><small>sin cambios</small></div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="boton primario grande" to={DESTINO[tipoId!] ?? '/'}>Ver lo importado</Link>
          <button className="boton secundario" onClick={() => { setFinal(null); setTipoId(null); setHojas([]); setArchivo(null); }}>Importar otra planilla</button>
        </div>
      </div>
    );
  }
  if (isLoading) return <Cargando />;

  const pasos: Paso[] = [
    {
      titulo: '¿Qué vas a importar?',
      ayuda: 'Elegí qué tiene la planilla. Si no sabés cómo armarla, bajá la planilla modelo y completala.',
      contenido: (
        <>
          <Opciones valor={tipoId} onChange={(v) => { setTipoId(v); setPrueba(null); }} opciones={(tipos ?? []).map((t) => ({ valor: t.id, titulo: t.titulo, detalle: AYUDA[t.id] }))} />
          {tipo && <button type="button" className="boton secundario" style={{ justifySelf: 'start' }} onClick={() => bajarModelo(tipo)}><Download size={18} aria-hidden /> Bajar planilla modelo</button>}
        </>
      ),
      listo: tipoId ? true : 'Elegí qué vas a importar',
    },
    {
      titulo: 'Subí la planilla',
      ayuda: 'Un Excel (.xlsx) o un CSV. Puede tener títulos arriba: el sistema busca la fila con los nombres de las columnas.',
      contenido: (
        <>
          <label className="boton secundario grande" style={{ cursor: 'pointer' }}>
            <Upload size={20} aria-hidden /> {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
            <input type="file" hidden accept=".xlsx,.csv,.txt,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => void subir(e.target.files?.[0])} />
          </label>
          <Aviso>{errorArchivo}</Aviso>
          {archivo && hoja && (
            <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
              <div className="con-muestra"><FileSpreadsheet size={22} aria-hidden style={{ color: 'var(--ok)' }} /><b>{archivo}</b></div>
              {hojas.length > 1 && <Campo etiqueta="¿Qué hoja?"><Opciones columnas valor={hojaI} onChange={setHojaI} opciones={hojas.map((x, i) => ({ valor: i, titulo: x.nombre }))} /></Campo>}
              <p className="tenue">Encontramos {filas.length} filas con datos debajo de los títulos (fila {h + 1}).</p>
            </div>
          )}
        </>
      ),
      listo: !hoja ? 'Subí el archivo' : !filas.length ? 'La planilla no tiene filas con datos' : true,
    },
    {
      titulo: '¿Qué columna es cada dato?',
      ayuda: 'Ya elegimos las columnas que se parecen por el nombre. Revisá y corregí si hace falta. Los marcados con * son obligatorios.',
      contenido: tipo && (
        <>
          {tipo.campos.map((c) => (
            <Campo key={c.id} etiqueta={`${c.titulo}${c.obligatorio ? ' *' : ''}`}>
              <Opciones<number | null> columnas valor={mapa[c.id] ?? null}
                onChange={(i) => setMapa((m) => { const n = { ...m }; if (i === null) delete n[c.id]; else n[c.id] = i; return n; })}
                opciones={[...(c.obligatorio ? [] : [{ valor: null, titulo: 'No está en la planilla' }]), ...titulos.map((t, i) => ({ valor: i, titulo: t, detalle: String(hoja?.filas[h + 1]?.[i] ?? '') || undefined }))]} />
            </Campo>
          ))}
          {filas.length > 0 && (
            <div className="hoja" style={{ overflowX: 'auto' }}>
              <table className="permisos" style={{ minWidth: 480 }}>
                <thead><tr><th>Fila</th>{tipo.campos.filter((c) => mapa[c.id] !== undefined).map((c) => <th key={c.id}>{c.titulo}</th>)}</tr></thead>
                <tbody>{filas.slice(0, 5).map((f) => <tr key={String(f._fila)}><td>{f._fila}</td>{tipo.campos.filter((c) => mapa[c.id] !== undefined).map((c) => <td key={c.id}>{String(f[c.id] ?? '')}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      ),
      listo: faltan.length ? `Falta elegir la columna de: ${faltan.map((c) => c.titulo).join(', ')}` : true,
    },
    {
      titulo: 'Revisá antes de importar',
      ayuda: 'Probamos la planilla sin guardar nada. Si hay errores, corregilos en el Excel y volvé a subirlo: no se importa nada hasta que esté todo bien.',
      contenido: (
        <>
          {(tipoId === 'clientes' || tipoId === 'proveedores') && (
            <Campo etiqueta="Si ya existe uno con el mismo nombre">
              <Opciones columnas valor={actualizar} onChange={setActualizar} opciones={[{ valor: false, titulo: 'Dejarlo como está' }, { valor: true, titulo: 'Actualizar sus datos' }]} />
            </Campo>
          )}
          {tieneFecha && mapa.fecha === undefined && (
            <Campo etiqueta="Fecha de los saldos" ayuda={verFecha(fecha)}><Entrada type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></Campo>
          )}
          {probando && <p className="tenue">Revisando la planilla…</p>}
          {prueba && (
            <>
              <div className="cifras">
                <div><span className="cifra">{prueba.nuevos}</span><small>se van a crear</small></div>
                <div><span className="cifra">{prueba.actualizados}</span><small>se van a actualizar</small></div>
                <div><span className="cifra">{prueba.sinCambios}</span><small>quedan igual</small></div>
              </div>
              {prueba.errores.length > 0 && (
                <div className="hoja">
                  <div className="fila"><h3>{prueba.errores.length === 1 ? '1 fila con error' : `${prueba.errores.length} filas con errores`}</h3></div>
                  {prueba.errores.slice(0, 50).map((e, i) => <div className="fila" key={i}><span>Fila {e.fila}</span><span className="saldo-mas">{e.mensaje}</span></div>)}
                </div>
              )}
            </>
          )}
        </>
      ),
      listo: probando || !prueba ? 'Revisando…' : prueba.errores.length ? 'Corregí los errores en la planilla y volvé a subirla (paso 2)' : prueba.nuevos + prueba.actualizados === 0 ? 'No hay nada nuevo para importar' : true,
    },
  ];

  const importar = async () => {
    setGuardando(true);
    setError(null);
    try {
      setFinal(await api<Resultado>(`/importar/${tipo!.id}`, { method: 'POST', body: { modo: 'importar', filas, actualizar, fecha } }));
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar');
    } finally {
      setGuardando(false);
    }
  };

  return <Asistente proceso="importar" pasos={pasos} onTerminar={importar} textoTerminar="Importar" guardando={guardando} error={error} onCancelar={() => navegar('/exportar')} />;
}
