import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Copy, MessageCircle } from 'lucide-react';
import { formatCantidad, formatMinutos, formatPesos, plural, type Unidad } from '@moldeados/shared/base';
import { api, hoy, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { Muestra } from '../MapleVista';
import { BotonExportar } from './Exportar';
import { Cabecera, Cargando, Dialogo } from '../ui';

// Dos series, siempre en este orden y color (validados para daltonismo con el validador de paleta):
// ingresos = azul de la marca, egresos = naranja cartón.
const C_INGRESOS = '#004fbc';
const C_EGRESOS = '#c2691f';

interface Ranking { id: string; nombre: string; total: number }
interface Datos {
  desde: string; hasta: string; paso: 'day' | 'week';
  ventas: { total: number; conFactura: number; cantidad: number; maples: number };
  compras: { total: number; conFactura: number };
  gastos: { total: number };
  cobros: number; pagos: number; resultado: number;
  porCliente: Ranking[]; porProveedor: Ranking[]; porCategoria: Ranking[];
  produccion: { codigo: string; colorHex: string | null; paquetes: number; maples: number; minutos: number }[];
  consumo: { nombre: string; unidad: Unidad; real: number; teorico: number }[];
  serie: { inicio: string; ingresos: number; egresos: number }[];
  porCalidad: { calidad: 'primera' | 'segunda'; total: number; maples: number }[];
  costos: {
    porCodigo: { id: string; codigo: string; colorHex: string | null; costoMaple: number | null; faltaPrecio: boolean; precioMaple: number | null; maplesVendidos: number }[];
    porCliente: { id: string; nombre: string; neto: number; costo: number; margen: number; sinCosto: boolean }[];
  };
  porCobrar: number; porPagar: number; caja: number; materiasBajoMinimo: number; paletsListos: { cantidad: number; paquetes: number };
}

const fmtCompacto = (c: number) => {
  const p = c / 100;
  if (Math.abs(p) >= 1e6) return `$${(p / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(p) >= 1e3) return `$${Math.round(p / 1e3).toLocaleString('es-AR')} mil`;
  return `$${Math.round(p)}`;
};

function periodo(clave: string): [string, string] {
  const h = hoy();
  const [y, m] = h.split('-').map(Number) as [number, number];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (clave === 'mes') return [`${h.slice(0, 8)}01`, h];
  if (clave === 'mes-pasado') return [iso(new Date(Date.UTC(y, m - 2, 1))), iso(new Date(Date.UTC(y, m - 1, 0)))];
  if (clave === '30') { const d = new Date(h + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 29); return [iso(d), h]; }
  return [`${y}-01-01`, h];
}
const PERIODOS = [['mes', 'Este mes'], ['mes-pasado', 'Mes pasado'], ['30', 'Últimos 30 días'], ['anio', 'Este año']] as const;

/** El tablero del dueño: cuánto entró, cuánto salió, qué se hizo, quién debe. */
export function Tablero() {
  const [f, setF] = useFiltros({ periodo: 'mes', anio: '' });
  const [resumen, setResumen] = useState(false);
  const clave = f.periodo;
  const [desde, hasta] = periodo(clave);
  const { data: t, isLoading } = useQuery({ queryKey: ['tablero', desde, hasta], queryFn: () => api<Datos>(`/tablero?desde=${desde}&hasta=${hasta}`) });
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="ancho" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Tablero" dato bajada={`Del ${verFecha(desde)} al ${verFecha(hasta)}`}>
        <div className="pestanas" role="group" aria-label="Período">
          {PERIODOS.map(([k, l]) => <button key={k} aria-pressed={clave === k} onClick={() => setF({ periodo: k })}>{l}</button>)}
        </div>
        <div className="acciones-titulo">
          <BotonExportar que="todo" desde={desde} hasta={hasta} texto="Descargar (.zip)" />
          <button className="boton secundario" onClick={() => setResumen(true)}><MessageCircle size={18} aria-hidden /> Resumen del día</button>
        </div>
      </Cabecera>
      {resumen && <ResumenDelDia onCerrar={() => setResumen(false)} />}
      {isLoading || !t ? <Cargando /> : (
        <>
          <div className="cifras">
            <div><span className={`cifra ${t.resultado < 0 ? 'saldo-mas' : 'saldo-ok'}`}>{t.resultado < 0 ? '− ' : ''}{formatPesos(Math.abs(t.resultado))}</span><small>{t.resultado < 0 ? 'resultado: salió más de lo que se vendió' : 'resultado: ventas menos egresos'}</small></div>
            <div><span className="cifra">{formatPesos(t.ventas.total)}</span><small>total ingresos (ventas) · {plural(t.ventas.maples, 'maple', 'maples')} en {plural(t.ventas.cantidad, 'despacho', 'despachos')}</small></div>
            <div><span className="cifra">{formatPesos(t.compras.total)}</span><small>en compras de materia prima</small></div>
            <div><span className="cifra">{formatPesos(t.gastos.total)}</span><small>en egresos</small></div>
          </div>

          <div className="cifras">
            <Link to="/cuentas" className="tile-link"><span className="cifra">{formatPesos(t.porCobrar)}</span><small>nos deben los clientes hoy</small></Link>
            <Link to="/cuentas" className="tile-link"><span className="cifra">{formatPesos(t.porPagar)}</span><small>les debemos a proveedores hoy</small></Link>
            <Link to="/caja" className="tile-link"><span className="cifra">{formatPesos(t.caja)}</span><small>en caja chica</small></Link>
            <Link to="/palets" className="tile-link"><span className="cifra">{t.paletsListos.cantidad ? plural(t.paletsListos.cantidad, 'palet', 'palets') : 'Ninguno'}</span><small>{t.paletsListos.cantidad ? `listos para salir · ${plural(t.paletsListos.paquetes, 'paquete', 'paquetes')}` : 'palet listo para salir'}</small></Link>
          </div>
          {t.materiasBajoMinimo > 0 && (
            <Link to="/materia-prima" className="atencion-item atencion" style={{ textDecoration: 'none' }}>
              <AlertTriangle size={20} aria-hidden /> {t.materiasBajoMinimo === 1 ? 'Una materia prima está' : `${t.materiasBajoMinimo} materias primas están`} por debajo del stock mínimo.
            </Link>
          )}

          <BalanceMensual anio={Number(f.anio) || new Date().getFullYear()} onAnio={(a) => setF({ anio: String(a) })} />

          <section className="hoja relleno" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <h3>Entradas y salidas {t.paso === 'week' ? 'por semana' : 'por día'}</h3>
            <GraficoIngresosEgresos serie={t.serie} paso={t.paso} />
            <p className="chico tenue">Cobrado en el período: {formatPesos(t.cobros)} · Pagado a proveedores: {formatPesos(t.pagos)}</p>
          </section>

          <div className="rejilla par">
            <BarrasRanking titulo="Ventas por cliente" filas={t.porCliente} color={C_INGRESOS} vacio="Sin ventas en el período." enlace={(id) => `/cuentas/cliente/${id}`} />
            <BarrasRanking titulo="Compras por proveedor" filas={t.porProveedor} color={C_EGRESOS} vacio="Sin compras en el período." enlace={(id) => `/cuentas/proveedor/${id}`} />
          </div>
          <CostoYMargen c={t.costos} />

          <div className="rejilla par">
            <BarrasRanking titulo="Egresos por categoría" filas={t.porCategoria} color={C_EGRESOS} vacio="Sin egresos en el período." />
            <BarrasRanking titulo="Ventas por calidad" filas={t.porCalidad.map((c) => ({ id: c.calidad, nombre: `${c.calidad === 'segunda' ? 'Segunda' : 'Primera'} · ${c.maples.toLocaleString('es-AR')} maples`, total: c.total }))} color={C_INGRESOS} vacio="Sin ventas en el período." />
            <section className="hoja">
              <div className="fila"><h3>Producción</h3><Link to="/produccion" className="chico">Ver planilla</Link></div>
              {!t.produccion.length && <p className="tenue" style={{ padding: '0 18px 18px' }}>Sin partes en el período.</p>}
              {t.produccion.map((p) => (
                <div className="fila" key={p.codigo}>
                  <span className="con-muestra"><Muestra color={p.colorHex} /> <span><span className="principal">{p.codigo}</span><br /><span className="chico tenue">{formatMinutos(p.minutos)} de máquina</span></span></span>
                  <span className="derecha"><span className="cifra">{p.maples.toLocaleString('es-AR')}</span><br /><span className="chico tenue">maples · {p.paquetes} paq.</span></span>
                </div>
              ))}
              {t.consumo.map((c) => {
                const d = c.teorico ? Math.round(((c.real - c.teorico) / c.teorico) * 100) : 0;
                return (
                  <div className="fila" key={c.nombre}>
                    <span>{c.nombre}</span>
                    <span className="derecha"><span className="cifra">{formatCantidad(c.real, c.unidad)}</span>{d !== 0 && <><br /><span className={`chico ${d > 0 ? 'desvio-mas' : 'desvio-menos'}`}>{d > 0 ? '+' : ''}{d} % contra receta</span></>}</span>
                  </div>
                );
              })}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** Ranking de una sola serie: barras horizontales con el valor al final. Más de 6 → el resto se agrupa. */
function BarrasRanking({ titulo, filas, color, vacio, enlace }: { titulo: string; filas: Ranking[]; color: string; vacio: string; enlace?: (id: string) => string }) {
  const top = filas.slice(0, 6);
  const resto = filas.slice(6).reduce((a, f) => a + f.total, 0);
  const lista = resto ? [...top, { id: '', nombre: `Otros (${filas.length - 6})`, total: resto }] : top;
  const max = Math.max(1, ...lista.map((f) => f.total));
  return (
    <section className="hoja">
      <div className="fila"><h3>{titulo}</h3></div>
      {!lista.length && <p className="tenue" style={{ padding: '0 18px 18px' }}>{vacio}</p>}
      <div style={{ display: 'grid', gap: 12, padding: lista.length ? '4px 18px 18px' : 0 }}>
        {lista.map((f) => {
          const cont = (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{f.nombre}</span><span className="cifra">{formatPesos(f.total)}</span></div>
              <div style={{ height: 10, marginTop: 4 }}><div style={{ width: `${(f.total / max) * 100}%`, minWidth: 4, height: '100%', background: color, borderRadius: '0 4px 4px 0' }} /></div>
            </>
          );
          return f.id && enlace ? <Link key={f.nombre} to={enlace(f.id)} style={{ textDecoration: 'none' }}>{cont}</Link> : <div key={f.nombre}>{cont}</div>;
        })}
      </div>
    </section>
  );
}

/** Columnas agrupadas: ingresos y egresos por período, un solo eje en pesos, con tooltip y vista de tabla. */
function GraficoIngresosEgresos({ serie, paso }: { serie: Datos['serie']; paso: 'day' | 'week' }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setAncho(e!.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const alto = 240, mL = 64, mR = 8, mT = 8, mB = 28;
  const max = Math.max(1, ...serie.flatMap((s) => [s.ingresos, s.egresos]));
  // Escala "linda": 1, 2 o 5 × 10^n por encima del máximo, en 4 marcas.
  const crudo = max / 4, mag = 10 ** Math.floor(Math.log10(crudo)), paso4 = [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= crudo)!;
  const tope = paso4 * 4;
  const plotW = Math.max(10, ancho - mL - mR), plotH = alto - mT - mB;
  const banda = plotW / Math.max(1, serie.length);
  const barra = Math.max(2, Math.min(24, (banda * 0.7 - 2) / 2));
  const y = (v: number) => mT + plotH - (v / tope) * plotH;
  const cada = Math.ceil(serie.length / Math.max(1, Math.floor(plotW / 56))); // etiquetas sin pisarse
  const etiqueta = (iso: string) => { const [, m, d] = iso.split('-'); return paso === 'week' ? `sem ${Number(d)}/${Number(m)}` : `${Number(d)}/${Number(m)}`; };
  const columna = (x: number, v: number) => {
    const top = y(v), base = mT + plotH, r = Math.min(4, base - top);
    if (v <= 0) return '';
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barra - r} Q${x + barra},${top} ${x + barra},${top + r} V${base} Z`;
  };
  const h = hover !== null ? serie[hover] : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.875rem', marginBottom: 8 }}>
        <span className="con-muestra" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C_INGRESOS, display: 'inline-block' }} /> Ingresos (ventas)</span>
        <span className="con-muestra" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C_EGRESOS, display: 'inline-block' }} /> Egresos (compras y egresos)</span>
      </div>
      <div ref={caja} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg width={ancho} height={alto} role="img" aria-label="Ingresos y egresos por período" style={{ display: 'block', overflow: 'visible' }}>
          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k}>
              <line x1={mL} x2={mL + plotW} y1={y(paso4 * k)} y2={y(paso4 * k)} stroke="var(--linea)" strokeWidth={1} />
              <text x={mL - 8} y={y(paso4 * k)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--tinta-2)">{fmtCompacto(paso4 * k)}</text>
            </g>
          ))}
          {serie.map((s, i) => {
            const x0 = mL + i * banda + (banda - (barra * 2 + 2)) / 2;
            return (
              <g key={s.inicio}>
                {hover === i && <rect x={mL + i * banda} y={mT} width={banda} height={plotH} fill="var(--piso)" />}
                <path d={columna(x0, s.ingresos)} fill={C_INGRESOS} />
                <path d={columna(x0 + barra + 2, s.egresos)} fill={C_EGRESOS} />
                {i % cada === 0 && <text x={mL + i * banda + banda / 2} y={alto - 8} textAnchor="middle" fontSize={11} fill="var(--tinta-2)">{etiqueta(s.inicio)}</text>}
                {/* zona de toque más grande que la columna */}
                <rect x={mL + i * banda} y={mT} width={banda} height={plotH + mB} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div role="tooltip" style={{ position: 'absolute', top: 0, left: Math.min(Math.max(0, mL + hover * banda + banda / 2 - 90), ancho - 180), width: 180, background: 'var(--tinta)', color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: '0.85rem', pointerEvents: 'none' }}>
            <b>{paso === 'week' ? `Semana del ${verFecha(h.inicio)}` : verFecha(h.inicio)}</b>
            <div>Ingresos: {formatPesos(h.ingresos)}</div>
            <div>Egresos: {formatPesos(h.egresos)}</div>
          </div>
        )}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="chico" style={{ cursor: 'pointer' }}>Ver como tabla</summary>
        <table className="permisos" style={{ marginTop: 8 }}>
          <thead><tr><th>{paso === 'week' ? 'Semana del' : 'Día'}</th><th>Ingresos</th><th>Egresos</th></tr></thead>
          <tbody>{serie.filter((s) => s.ingresos || s.egresos).map((s) => <tr key={s.inicio}><td>{verFecha(s.inicio)}</td><td>{formatPesos(s.ingresos)}</td><td>{formatPesos(s.egresos)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

/** Cuánto cuesta en materia prima cada maple y cuánto deja cada código y cada cliente. */
function CostoYMargen({ c }: { c: Datos['costos'] }) {
  if (!c.porCodigo.length) return null;
  const pct = (precio: number | null, costo: number | null) => (precio && costo !== null ? Math.round(((precio - costo) / precio) * 100) : null);
  return (
    <div className="rejilla par">
      <section className="hoja">
        <div className="fila"><div><h3>Costo y margen por maple</h3><p className="chico tenue">Materia prima al precio promedio de compra, sin IVA. No incluye egresos ni sueldos.</p></div></div>
        {c.porCodigo.map((x) => {
          const m = pct(x.precioMaple, x.costoMaple);
          return (
            <div className="fila" key={x.id}>
              <span className="con-muestra"><Muestra color={x.colorHex} />
                <span><span className="principal">{x.codigo}</span><br />
                  <span className="chico tenue">Cuesta {x.costoMaple !== null ? formatPesos(x.costoMaple) : 'sin datos'}{x.precioMaple ? ` · se vende a ${formatPesos(x.precioMaple)}` : ' · sin ventas en el período'}</span>
                  {x.faltaPrecio && <><br /><span className="chico" style={{ color: 'var(--alerta)' }}>Hay materia prima usada sin compras cargadas: el costo queda bajo.</span></>}
                </span>
              </span>
              <span className="derecha">{m !== null ? <><span className="cifra">{m} %</span><br /><span className="chico tenue">de margen</span></> : <span className="chico tenue">—</span>}</span>
            </div>
          );
        })}
      </section>
      <section className="hoja">
        <div className="fila"><div><h3>Lo que deja cada cliente</h3><p className="chico tenue">Venta sin IVA menos la materia prima de esos maples.</p></div></div>
        {!c.porCliente.length && <p className="tenue" style={{ padding: '0 18px 18px' }}>Sin ventas en el período.</p>}
        {c.porCliente.slice(0, 8).map((x) => (
          <Link key={x.id} to={`/cuentas/cliente/${x.id}`} className="fila">
            <span><span className="principal">{x.nombre}</span><br /><span className="chico tenue">Vendido {formatPesos(x.neto)}{x.sinCosto ? ' · algún maple sin costo calculado' : ''}</span></span>
            <span className="derecha"><span className={`cifra ${x.margen < 0 ? 'saldo-mas' : ''}`}>{x.margen < 0 ? '− ' : ''}{formatPesos(Math.abs(x.margen))}</span><br /><span className="chico tenue">{x.neto ? Math.round((x.margen / x.neto) * 100) : 0} %</span></span>
          </Link>
        ))}
      </section>
    </div>
  );
}

/** El resumen del día listo para mandar por WhatsApp (el mismo que llega por mail si está configurado). */
function ResumenDelDia({ onCerrar }: { onCerrar: () => void }) {
  const { data } = useQuery({ queryKey: ['resumen'], queryFn: () => api<{ titulo: string; texto: string }>('/resumen'), staleTime: 0 });
  const [copiado, setCopiado] = useState(false);
  return (
    <Dialogo titulo="Resumen del día" onCerrar={onCerrar}>
      {!data ? <Cargando /> : <pre className="resumen-texto">{data.texto.replace(/\*/g, '')}</pre>}
      <p className="chico tenue">Para recibirlo solo todas las noches por mail: Ajustes › Equipo › Datos de la empresa.</p>
      <div className="acciones">
        <button className="boton secundario" disabled={!data} onClick={async () => { await navigator.clipboard.writeText(data!.texto); setCopiado(true); }}><Copy size={18} aria-hidden /> {copiado ? 'Copiado' : 'Copiar'}</button>
        <a className="boton primario" href={data ? `https://wa.me/?text=${encodeURIComponent(data.texto)}` : undefined} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden /> Compartir por WhatsApp</a>
      </div>
    </Dialogo>
  );
}

interface MesBalance { mes: number; ingresos: number; cobrado: number; egresos: number; resultado: number; acumulado: number; variacion: number | null; maplesProducidos: number; maplesVendidos: number }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** "Balance — resumen mensual", con las mismas columnas que la planilla de finanzas, más los maples del mes. */
function BalanceMensual({ anio, onAnio }: { anio: number; onAnio: (a: number) => void }) {
  const { data } = useQuery({ queryKey: ['balance', anio], queryFn: () => api<MesBalance[]>(`/tablero/balance?anio=${anio}`) });
  const actual = new Date().getFullYear();
  // Del año en curso, hasta este mes; los meses sin nada al principio del año no se muestran.
  const hasta = anio === actual ? new Date().getMonth() + 1 : 12;
  const primero = data?.findIndex((m) => m.ingresos || m.egresos || m.maplesProducidos) ?? -1;
  const filas = (data ?? []).filter((m) => m.mes <= hasta && (primero < 0 || m.mes > primero));
  const total = (k: keyof MesBalance) => filas.reduce((a, m) => a + Number(m[k] ?? 0), 0);
  const signo = (n: number) => <span className={n < 0 ? 'saldo-mas' : ''}>{n < 0 ? `(${formatPesos(-n)})` : formatPesos(n)}</span>;
  return (
    <section className="hoja">
      <div className="fila">
        <div><h3>Balance mensual</h3><p className="chico tenue">Total ingresos (ventas) y total egresos (compras de materia prima y egresos), mes por mes.</p></div>
        <div className="pestanas" role="group" aria-label="Año">
          {[actual - 1, actual].map((a) => <button key={a} aria-pressed={anio === a} onClick={() => onAnio(a)}>{a}</button>)}
        </div>
      </div>
      {!filas.length ? <p className="tenue" style={{ padding: '0 18px 18px' }}>Sin movimientos en {anio}.</p> : (
        <div className="tabla-scroll">
          <table className="tabla-balance">
            <thead><tr><th>Mes</th><th>Total ingresos</th><th>Total egresos</th><th>Resultado del mes</th><th>Saldo acumulado</th><th>% vs mes anterior</th><th>Maples producidos</th><th>Maples vendidos</th></tr></thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.mes}>
                  <th>{MESES[m.mes - 1]}</th>
                  <td>{formatPesos(m.ingresos)}</td><td>{formatPesos(m.egresos)}</td><td>{signo(m.resultado)}</td><td>{signo(m.acumulado)}</td>
                  <td>{m.variacion === null ? '' : `${m.variacion.toLocaleString('es-AR')} %`}</td>
                  <td>{m.maplesProducidos.toLocaleString('es-AR')}</td><td>{m.maplesVendidos.toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th>Total</th><td>{formatPesos(total('ingresos'))}</td><td>{formatPesos(total('egresos'))}</td><td>{signo(total('resultado'))}</td><td>{signo(filas.at(-1)?.acumulado ?? 0)}</td><td /><td>{total('maplesProducidos').toLocaleString('es-AR')}</td><td>{total('maplesVendidos').toLocaleString('es-AR')}</td></tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
