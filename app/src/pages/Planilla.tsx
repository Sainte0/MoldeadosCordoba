import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tareasDe } from '../navegacion';
import { ALTOS_PALET, formatPesos } from '@moldeados/shared/base';
import { api, hoy, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { Muestra } from '../MapleVista';
import { porMaple, type StockPallet } from './Plastificar';

// Hoy (el inicio): todo lo del día en una pantalla. Los pallets que salieron de la plastificadora, las órdenes para
// cargar, lo vendido, el cartón que entró y lo que hay en la fábrica por tipo y alto.

interface Dia {
  fecha: string;
  pallets: { id: string; numero: number; alto: number; cargadoAt: string; codigo: string; colorHex: string | null; maples: number }[];
  ventas: { id: string; numero: number; cliente: string; total: number; cuenta1: boolean; ordenId: string | null; palets: number; codigos: string | null; maples: number }[];
  carton: { id: string; numero: number; proveedor: string; gramos: number; total: number }[];
  stock: StockPallet[];
  cobrado: number;
}
interface OrdenAbierta { id: string; numero: number; cliente: string; detalle: string; pedidos: number; cargados: number; chofer: string | null }

const hora = (iso: string) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso));
const pallets = (n: number) => `${n} ${n === 1 ? 'pallet' : 'pallets'}`;

/** El día en el inicio ("Hoy"). */
export function PlanillaDia({ fecha }: { fecha: string }) {
  const { puede } = useSesion();
  const { data: dia } = useQuery({ queryKey: ['planilla', fecha], queryFn: () => api<Dia>(`/planilla?fecha=${fecha}`), refetchInterval: 30_000 });
  const verOrdenes = puede('ventas') || puede('produccion', 2);
  const { data: ordenes } = useQuery({ queryKey: ['ordenes', 'abierta'], queryFn: () => api<OrdenAbierta[]>('/ordenes?estado=abierta'), enabled: verOrdenes, refetchInterval: 15_000 });
  if (!dia) return null;
  const vendido = dia.ventas.reduce((a, v) => a + v.total, 0);
  // Una orden Mixta son dos ventas con los mismos pallets: se cuentan una vez.
  const salieron = dia.ventas.filter((v, i) => !v.ordenId || dia.ventas.findIndex((x) => x.ordenId === v.ordenId) === i).reduce((a, v) => a + v.palets, 0);
  const enFabrica = dia.stock.reduce((a, s) => a + s.pallets, 0);
  const esHoy = fecha === hoy();
  const abiertas = ordenes ?? [];
  // Los botones grandes, en el orden de su puesto (el primero, en azul).
  const grandes = tareasDe(puede).filter((t) => ['/plastificar', '/ordenes', '/ordenes/nueva'].includes(t.a));
  return (
    <div className="planilla" style={{ display: 'grid', gap: 16 }}>
      {/* Lo que hace cada uno (pedido 01): pallet que sale de la plastificadora, camión para cargar, orden de venta. */}
      {esHoy && grandes.length > 0 && (
        <nav className="accesos-grandes" aria-label="Lo de todos los días">
          {grandes.map((t) => (
            <Link key={t.a} to={t.a === '/ordenes' && abiertas.length === 1 ? `/ordenes/${abiertas[0]!.numero}` : t.a} className="acceso-grande">
              <t.icono size={30} aria-hidden /><b>{t.titulo}</b>
              <small>{t.a === '/ordenes' ? (abiertas.length ? `${abiertas.length === 1 ? '1 orden para cargar' : `${abiertas.length} órdenes para cargar`}` : 'No hay órdenes para cargar') : t.a === '/plastificar' ? 'Tamaño, color, alto y listo' : 'Cliente, chofer y qué se lleva'}</small>
            </Link>
          ))}
        </nav>
      )}
      {/* Lo más importante del día, en cifras cortas: lo detallado está abajo en cada bloque. */}
      <div className="cifras resumen-dia">
        <Tarjeta a="/palets" titulo={esHoy ? 'Pallets de hoy' : `Pallets del ${verFecha(fecha)}`} numero={pallets(dia.pallets.length)} detalle={`${dia.pallets.reduce((a, p) => a + p.maples, 0).toLocaleString('es-AR')} maples`} />
        {puede('ventas') && <Tarjeta a={`/ventas?desde=${fecha}&hasta=${fecha}`} titulo="Vendido" numero={formatPesos(vendido)} detalle={`${pallets(salieron)} salieron`} />}
        {puede('cuentas') && <Tarjeta a="/cuentas" titulo="Cobrado" numero={formatPesos(dia.cobrado)} detalle="lo que entró de plata" />}
        <Tarjeta a="/palets" titulo="En la fábrica" numero={pallets(enFabrica)} detalle="listos para vender" />
      </div>

      {verOrdenes && abiertas.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Para cargar</h3></div>
          {(ordenes ?? []).map((o) => (
            <Link key={o.id} to={`/ordenes/${o.numero}`} className="fila">
              <span><span className="principal">{o.cliente}</span><br /><span className="chico tenue">{o.detalle}{o.chofer ? ` · ${o.chofer}` : ''}</span></span>
              <span className="cifra">{o.cargados} de {o.pedidos}</span>
            </Link>
          ))}
        </section>
      )}

      <EnLaFabrica stock={dia.stock} />

      {puede('produccion') && (
        <section className="hoja">
          <div className="fila"><h3>Pallets que salieron de la plastificadora</h3></div>
          {dia.pallets.slice(0, 3).map((p) => (
            <Link key={p.id} to={`/palets/${p.numero}`} className="fila">
              <span className="con-muestra"><Muestra color={p.colorHex} /> <span><span className="principal">{p.codigo} de {p.alto}</span><br /><span className="chico tenue">N.º {nroTicket(p.numero)} · {hora(p.cargadoAt)}</span></span></span>
            </Link>
          ))}
          {dia.pallets.length > 3 && <Link to="/palets" className="fila mostrar-mas">Ver los {dia.pallets.length} de hoy</Link>}
          {!dia.pallets.length && <p className="chico tenue" style={{ padding: '0 18px 14px' }}>Todavía no salió ninguno{esHoy ? ' hoy' : ''}.</p>}
        </section>
      )}

      {puede('ventas') && dia.ventas.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Lo que se vendió</h3></div>
          {dia.ventas.map((v) => (
            <Link key={v.id} to={`/ventas/${v.numero}`} className="fila">
              <span><span className="principal">{v.cliente}</span><br /><span className="chico tenue">{v.cuenta1 ? 'Cuenta 1' : 'Cuenta 2'} · {v.codigos ?? ''} · {v.maples.toLocaleString('es-AR')} maples</span></span>
              <span className="cifra">{formatPesos(v.total)}</span>
            </Link>
          ))}
        </section>
      )}


    </div>
  );
}

/** Stock por tipo y alto (pedido 01): una fila por maple y una columna por alto, como lo cuentan en la planta. */
export function EnLaFabrica({ stock }: { stock: StockPallet[] }) {
  const grupos = porMaple(stock);
  const altos = [...new Set([...ALTOS_PALET, ...stock.map((s) => s.alto)])].sort((x, y) => y - x);
  const enCarga = stock.reduce((n, s) => n + s.enCarga, 0);
  return (
    <section className="hoja">
      <div className="fila"><div><h3>En la fábrica</h3><span className="chico tenue">Pallets por tipo y alto{enCarga ? ` · ${enCarga} ya en un camión cargando` : ''}</span></div></div>
      {grupos.length ? (
        <div className="tabla-scroll">
          <table className="tabla-stock">
            <thead><tr><th>Maple</th>{altos.map((a) => <th key={a}>de {a}</th>)}<th>Pallets</th><th>Maples</th></tr></thead>
            <tbody>
              {grupos.map((g) => {
                const v = g[0]!;
                const total = g.reduce((n, x) => n + x.pallets, 0);
                return (
                  <tr key={v.varianteId}>
                    <th><Link to={`/palets?q=${v.codigo}`} className="con-muestra"><Muestra color={v.colorHex} /> {v.codigo}</Link></th>
                    {altos.map((a) => { const n = g.find((x) => x.alto === a)?.pallets ?? 0; return <td key={a} className={n ? '' : 'cero'}>{n || '·'}</td>; })}
                    <td><b>{total}</b></td>
                    <td className="tenue">{g.reduce((n, x) => n + x.paquetes * x.maplesPorPaquete, 0).toLocaleString('es-AR')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="chico tenue" style={{ padding: '0 18px 14px' }}>No hay pallets en la fábrica.</p>}
    </section>
  );
}

/** Tarjeta del resumen: se toca y lleva al detalle. */
function Tarjeta({ a, titulo, numero, detalle }: { a: string; titulo: string; numero: string; detalle: string }) {
  return <Link to={a}><small>{titulo}</small><span className="cifra">{numero}</span><small>{detalle}</small></Link>;
}

/** Cuenta 1 / Cuenta 2 (con o sin factura, sin decirlo). */
export function Cuenta({ valor, onChange }: { valor: boolean; onChange: (cuenta1: boolean) => void }) {
  return (
    <div className="pestanas" role="group" aria-label="Cuenta">
      <button type="button" aria-pressed={valor} onClick={() => onChange(true)}>Cuenta 1</button>
      <button type="button" aria-pressed={!valor} onClick={() => onChange(false)}>Cuenta 2</button>
    </div>
  );
}
