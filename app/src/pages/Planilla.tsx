import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { aCentavos, formatPesos, LABEL_TURNO, PALET_DEFAULT, TURNOS, type Turno } from '@moldeados/shared/base';
import { api, hoy, useSesion, verFecha } from '../api';
import { useClientes, useEmpleados, useMaterias, useProveedores, useVariantes } from '../datos';
import { Muestra } from '../MapleVista';
import { Aviso, Campo, Entrada } from '../ui';

// Planilla del día (el inicio, "Hoy"): todo lo del día en una pantalla, como la planilla de papel. Lo fabricado (palets × alto), lo que
// se vendió/retiró y el cartón que entró. Detrás guarda partes, ventas y pesajes: el resto del sistema sigue igual.

interface Dia {
  fecha: string; paquetesPorNivel: number;
  produccion: { id: string; numero: number; turno: Turno; minutos: number; paquetes: number; notas: string | null; codigo: string; colorHex: string | null; maquina: string; maples: number }[];
  ventas: { id: string; numero: number; cliente: string; total: number; palets: number; codigos: string | null; maples: number }[];
  carton: { id: string; numero: number; proveedor: string; gramos: number; total: number }[];
  stock: { id: string; codigo: string; nombre: string; colorHex: string | null; paquetes: number }[];
  cobrado: number;
}

const ALTO = PALET_DEFAULT.alto;
/** "2 palets de 6 y 2 de alto": así cuentan en la fábrica (ancho y largo fijos, se arma y desarma a medida). */
function enPalets(paquetes: number, porNivel: number): string {
  if (paquetes <= 0) return 'Nada';
  const niveles = Math.floor(paquetes / porNivel);
  const palets = Math.floor(niveles / ALTO);
  const resto = niveles % ALTO;
  const sueltos = paquetes % porNivel;
  const partes = [palets ? `${palets} ${palets === 1 ? 'palet' : 'palets'} de ${ALTO}` : '', resto ? `${resto} de alto` : '', sueltos ? `${sueltos} paq.` : ''].filter(Boolean);
  return partes.join(' y ');
}
/** Para las tarjetas: el número grande (palets de 6) y lo que sobra, aparte y chico. */
function paletsYResto(paquetes: number, porNivel: number): { palets: number; resto: string } {
  const p = Math.max(0, paquetes);
  const niveles = Math.floor(p / porNivel);
  const resto = [niveles % ALTO ? `${niveles % ALTO} de alto` : '', p % porNivel ? `${p % porNivel} paq.` : ''].filter(Boolean).join(' y ');
  return { palets: Math.floor(niveles / ALTO), resto };
}
const turnoAhora = (): Turno => (Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())) < 14 ? 'manana' : 'tarde');
const HORARIO: Record<Turno, [string, string]> = { manana: ['06:00', '14:00'], tarde: ['14:00', '22:00'] };
const horas = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

/** El día en el inicio ("Hoy"): resumen, lo fabricado, lo vendido, el cartón y lo que queda en la fábrica. */
export function PlanillaDia({ fecha }: { fecha: string }) {
  const { puede } = useSesion();
  const { data: dia } = useQuery({ queryKey: ['planilla', fecha], queryFn: () => api<Dia>(`/planilla?fecha=${fecha}`) });
  if (!dia) return null;
  const ppn = dia.paquetesPorNivel;
  const fabricado = dia.produccion.reduce((a, p) => a + p.paquetes, 0);
  const retirados = dia.ventas.reduce((a, v) => a + v.palets, 0);
  const enFabrica = dia.stock.reduce((a, s) => a + Math.max(0, s.paquetes), 0);
  const vendido = dia.ventas.reduce((a, v) => a + v.total, 0);
  const esHoy = fecha === hoy();
  return (
    <div className="planilla" style={{ display: 'grid', gap: 16 }}>
      {/* Lo más importante del día, en cifras cortas: lo detallado está abajo en cada bloque. */}
      <div className="cifras resumen-dia">
        <Tarjeta titulo={esHoy ? 'Fabricado hoy' : `Fabricado el ${verFecha(fecha)}`} {...enTarjeta(fabricado, ppn)} />
        <div><small>Vendido</small><span className="cifra">{formatPesos(vendido)}</span><small>{retirados} {retirados === 1 ? 'palet retirado' : 'palets retirados'}</small></div>
        <div><small>Cobrado</small><span className="cifra">{formatPesos(dia.cobrado)}</span><small>lo que entró de plata</small></div>
        <Tarjeta titulo="En la fábrica" {...enTarjeta(enFabrica, ppn)} />
      </div>
      {puede('produccion') && <Fabricado dia={dia} edita={puede('produccion', 2)} />}
      {puede('ventas') && <Vendido dia={dia} edita={puede('ventas', 2)} />}
      {puede('compras') && <Carton dia={dia} edita={puede('compras', 2)} />}
      <section className="hoja">
        <div className="fila"><h3>En la fábrica</h3>{puede('ventas', 2) && <Link to="/pedidos/nuevo" className="boton secundario"><ClipboardList size={18} aria-hidden /> Nuevo pedido</Link>}</div>
        {dia.stock.map((s) => (
          <div className="fila" key={s.id}>
            <span className="con-muestra"><Muestra color={s.colorHex} /> <span><span className="principal">{s.codigo}</span><br /><span className="chico tenue">{s.nombre}</span></span></span>
            <span className="derecha"><span className="cifra">{enPalets(s.paquetes, ppn)}</span><br /><span className="chico tenue">{Math.max(0, s.paquetes).toLocaleString('es-AR')} paquetes</span></span>
          </div>
        ))}
      </section>
    </div>
  );
}

const enTarjeta = (paquetes: number, porNivel: number) => {
  const { palets, resto } = paletsYResto(paquetes, porNivel);
  return { numero: `${palets} ${palets === 1 ? 'palet' : 'palets'}`, detalle: resto ? `+ ${resto}` : paquetes > 0 ? `de ${ALTO} de alto` : 'nada' };
};
function Tarjeta({ titulo, numero, detalle }: { titulo: string; numero: string; detalle: string }) {
  return <div><small>{titulo}</small><span className="cifra">{numero}</span><small>{detalle}</small></div>;
}

/** Encabezado de cada bloque: el título y "Agregar", que abre el renglón para cargar. */
function Cabeza({ titulo, detalle, edita, abierto, onAbrir }: { titulo: string; detalle?: string; edita: boolean; abierto: boolean; onAbrir: () => void }) {
  return (
    <div className="fila">
      <div><h3>{titulo}</h3>{detalle && <span className="chico tenue">{detalle}</span>}</div>
      {edita && !abierto && <button type="button" className="boton secundario" onClick={onAbrir}><Plus size={18} aria-hidden /> Agregar</button>}
    </div>
  );
}

/** Al guardar algo de la planilla: se actualiza la planilla y todo lo que depende (stock, ventas, cuentas). */
function useRefrescar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

function Fabricado({ dia, edita }: { dia: Dia; edita: boolean }) {
  const { data: variantes } = useVariantes();
  const { data: empleados } = useEmpleados();
  const refrescar = useRefrescar();
  const turno0 = turnoAhora();
  const [r, setR] = useState({ varianteId: '', turno: turno0, inicio: HORARIO[turno0][0], fin: HORARIO[turno0][1], palets: '', alto: String(ALTO), empleadoIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(dia.produccion.length === 0);
  const activas = (variantes ?? []).filter((v) => v.activo);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setGuardando(true);
    try {
      await api('/planilla/produccion', { method: 'POST', body: { fecha: dia.fecha, turno: r.turno, varianteId: r.varianteId, inicio: r.inicio, fin: r.fin, palets: Number(r.palets), alto: Number(r.alto), empleadoIds: r.empleadoIds } });
      setR({ ...r, palets: '', empleadoIds: [] }); // el resto queda igual: suele cargarse la otra máquina del mismo turno
      await refrescar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    setGuardando(false);
  };
  const turno = (t: Turno) => setR({ ...r, turno: t, inicio: HORARIO[t][0], fin: HORARIO[t][1] });
  return (
    <section className="hoja">
      <Cabeza titulo="Lo que se fabricó" detalle={dia.produccion.length ? `${dia.produccion.length} ${dia.produccion.length === 1 ? 'carga' : 'cargas'}` : undefined} edita={edita} abierto={abierto} onAbrir={() => setAbierto(true)} />
      {dia.produccion.map((p) => (
        <Link to={`/produccion/${p.numero}`} className="fila" key={p.id}>
          <span className="con-muestra"><Muestra color={p.colorHex} /> <span><span className="principal">{p.maquina} · {p.codigo}</span><br /><span className="chico tenue">{LABEL_TURNO[p.turno]} · {horas(p.minutos)}</span></span></span>
          <span className="derecha"><span className="cifra">{enPalets(p.paquetes, dia.paquetesPorNivel)}</span><br /><span className="chico tenue">{p.maples.toLocaleString('es-AR')} maples</span></span>
        </Link>
      ))}
      {edita && abierto && (
        <form className="planilla-renglon" onSubmit={guardar}>
          <Campo etiqueta="Maple">
            <select className="entrada" value={r.varianteId} onChange={(e) => setR({ ...r, varianteId: e.target.value })} required>
              <option value="">Elegí</option>
              {activas.map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.maquina}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Turno">
            <div className="pestanas">{TURNOS.map((t) => <button type="button" key={t} aria-pressed={r.turno === t} onClick={() => turno(t)}>{LABEL_TURNO[t]}</button>)}</div>
          </Campo>
          <Campo etiqueta="Comienzo"><Entrada type="time" value={r.inicio} onChange={(e) => setR({ ...r, inicio: e.target.value })} required /></Campo>
          <Campo etiqueta="Parada"><Entrada type="time" value={r.fin} onChange={(e) => setR({ ...r, fin: e.target.value })} required /></Campo>
          <Campo etiqueta="Palets"><Entrada inputMode="numeric" value={r.palets} onChange={(e) => setR({ ...r, palets: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="0" required /></Campo>
          <Campo etiqueta="Alto"><Entrada inputMode="numeric" value={r.alto} onChange={(e) => setR({ ...r, alto: e.target.value.replace(/\D/g, '').slice(0, 2) })} required /></Campo>
          {(empleados ?? []).filter((x) => x.activo).length > 0 && (
            <div className="planilla-quienes">
              <span className="chico tenue">Quiénes (opcional):</span>
              {(empleados ?? []).filter((x) => x.activo).map((x) => (
                <button type="button" key={x.id} className="chip" aria-pressed={r.empleadoIds.includes(x.id)}
                  onClick={() => setR({ ...r, empleadoIds: r.empleadoIds.includes(x.id) ? r.empleadoIds.filter((y) => y !== x.id) : [...r.empleadoIds, x.id] })}>{x.nombre}</button>
              ))}
            </div>
          )}
          {r.palets && r.alto && <p className="chico tenue planilla-cuenta">= {(Number(r.palets) * Number(r.alto) * dia.paquetesPorNivel).toLocaleString('es-AR')} paquetes</p>}
          <button className="boton primario" disabled={guardando || !r.varianteId || !r.palets}><Plus size={18} aria-hidden /> {guardando ? 'Guardando…' : 'Agregar'}</button>
          <Aviso>{error}</Aviso>
        </form>
      )}
    </section>
  );
}

function Vendido({ dia, edita }: { dia: Dia; edita: boolean }) {
  const { data: variantes } = useVariantes();
  const { data: clientes } = useClientes('');
  const refrescar = useRefrescar();
  const [r, setR] = useState({ cliente: '', varianteId: '', palets: '1', alto: String(ALTO), conFactura: false });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(dia.ventas.length === 0);
  const enStock = (id: string) => dia.stock.find((s) => s.id === id)?.paquetes ?? 0;
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setGuardando(true);
    try {
      const nombre = r.cliente.trim();
      // Escribiendo el nombre: si ya existe se usa ese cliente; si no, se crea (los datos se completan después).
      const existente = (clientes ?? []).find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
      const cliente = existente ?? await api<{ id: string }>('/clientes', { method: 'POST', body: { nombre } });
      await api('/planilla/venta', { method: 'POST', body: { fecha: dia.fecha, clienteId: cliente.id, varianteId: r.varianteId, palets: Number(r.palets), alto: Number(r.alto), conFactura: r.conFactura } });
      setR({ ...r, cliente: '', palets: '1' });
      await refrescar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    setGuardando(false);
  };
  return (
    <section className="hoja">
      <Cabeza titulo="Lo que se vendió y se retiró" detalle={dia.ventas.length ? `${dia.ventas.length} ${dia.ventas.length === 1 ? 'venta' : 'ventas'}` : undefined} edita={edita} abierto={abierto} onAbrir={() => setAbierto(true)} />
      {dia.ventas.map((v) => (
        <Link to={`/ventas/${v.numero}`} className="fila" key={v.id}>
          <span><span className="principal">{v.cliente}</span><br /><span className="chico tenue">{v.palets} {v.palets === 1 ? 'palet' : 'palets'}{v.codigos ? ` · ${v.codigos}` : ''} · {v.maples.toLocaleString('es-AR')} maples</span></span>
          <span className="cifra">{formatPesos(v.total)}</span>
        </Link>
      ))}
      {edita && abierto && (
        <form className="planilla-renglon" onSubmit={guardar}>
          <Campo etiqueta="Cliente">
            <Entrada list="planilla-clientes" value={r.cliente} onChange={(e) => setR({ ...r, cliente: e.target.value })} placeholder="Nombre" autoComplete="off" required />
            <datalist id="planilla-clientes">{(clientes ?? []).map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
          </Campo>
          <Campo etiqueta="Maple">
            <select className="entrada" value={r.varianteId} onChange={(e) => setR({ ...r, varianteId: e.target.value })} required>
              <option value="">Elegí</option>
              {(variantes ?? []).filter((v) => v.activo).map((v) => <option key={v.id} value={v.id}>{v.codigo} · hay {enPalets(enStock(v.id), dia.paquetesPorNivel).toLowerCase()}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Palets"><Entrada inputMode="numeric" value={r.palets} onChange={(e) => setR({ ...r, palets: e.target.value.replace(/\D/g, '').slice(0, 3) })} required /></Campo>
          <Campo etiqueta="Alto"><Entrada inputMode="numeric" value={r.alto} onChange={(e) => setR({ ...r, alto: e.target.value.replace(/\D/g, '').slice(0, 2) })} required /></Campo>
          <label className="planilla-check"><input type="checkbox" checked={r.conFactura} onChange={(e) => setR({ ...r, conFactura: e.target.checked })} /> Con factura</label>
          <p className="chico tenue planilla-cuenta">Precio del cliente o de lista. Queda pendiente de cobro.</p>
          <button className="boton primario" disabled={guardando || !r.cliente.trim() || !r.varianteId}><Plus size={18} aria-hidden /> {guardando ? 'Guardando…' : 'Agregar'}</button>
          <Aviso>{error}</Aviso>
        </form>
      )}
    </section>
  );
}

function Carton({ dia, edita }: { dia: Dia; edita: boolean }) {
  const { data: proveedores } = useProveedores('', 'carton');
  const { data: materias } = useMaterias();
  const refrescar = useRefrescar();
  const [r, setR] = useState({ proveedor: '', kilos: '', precio: '', conFactura: false });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(dia.carton.length === 0);
  const carton = (materias ?? []).find((m) => m.tipo === 'carton' && m.activo);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const precio = aCentavos(r.precio);
    if (!carton) return setError('No hay materia prima "cartón" cargada');
    if (precio === null) return setError('Revisá el precio por kilo');
    setGuardando(true);
    try {
      const nombre = r.proveedor.trim();
      const existente = (proveedores ?? []).find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
      const prov = existente ?? await api<{ id: string }>('/proveedores', { method: 'POST', body: { nombre, tipos: ['carton'] } });
      await api('/compras/pesaje', { method: 'POST', body: { proveedorId: prov.id, materiaPrimaId: carton.id, fecha: dia.fecha, brutoG: Math.round(Number(r.kilos.replace(',', '.')) * 1000), taraG: 0, precioPorKg: precio, conFactura: r.conFactura, ivaBp: 2100, notas: 'Planilla del día' } });
      setR({ ...r, proveedor: '', kilos: '' });
      await refrescar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    setGuardando(false);
  };
  return (
    <section className="hoja">
      <Cabeza titulo="Cartón que entró" detalle={dia.carton.length ? `${(dia.carton.reduce((a, c) => a + c.gramos, 0) / 1000).toLocaleString('es-AR')} kg` : undefined} edita={edita} abierto={abierto} onAbrir={() => setAbierto(true)} />
      {dia.carton.map((c) => (
        <Link to={`/compras/${c.numero}`} className="fila" key={c.id}>
          <span><span className="principal">{c.proveedor}</span><br /><span className="chico tenue">{(c.gramos / 1000).toLocaleString('es-AR')} kg</span></span>
          <span className="cifra">{formatPesos(c.total)}</span>
        </Link>
      ))}
      {edita && abierto && (
        <form className="planilla-renglon" onSubmit={guardar}>
          <Campo etiqueta="Proveedor">
            <Entrada list="planilla-proveedores" value={r.proveedor} onChange={(e) => setR({ ...r, proveedor: e.target.value })} placeholder="Nombre" autoComplete="off" required />
            <datalist id="planilla-proveedores">{(proveedores ?? []).map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
          </Campo>
          <Campo etiqueta="Kilos"><Entrada inputMode="decimal" value={r.kilos} onChange={(e) => setR({ ...r, kilos: e.target.value.replace(/[^\d,]/g, '') })} placeholder="5000" required /></Campo>
          <Campo etiqueta="$ por kilo"><Entrada inputMode="decimal" value={r.precio} onChange={(e) => setR({ ...r, precio: e.target.value.replace(/[^\d,]/g, '') })} placeholder="Sin IVA" required /></Campo>
          <label className="planilla-check"><input type="checkbox" checked={r.conFactura} onChange={(e) => setR({ ...r, conFactura: e.target.checked })} /> Con factura</label>
          <button className="boton primario" disabled={guardando || !r.proveedor.trim() || !r.kilos}><Plus size={18} aria-hidden /> {guardando ? 'Guardando…' : 'Agregar'}</button>
          <Aviso>{error}</Aviso>
        </form>
      )}
    </section>
  );
}
