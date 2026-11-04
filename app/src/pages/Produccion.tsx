import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { formatCantidad, formatMinutos, formatPesos, LABEL_TURNO, type Turno, type Unidad } from '@moldeados/shared/base';
import { api, hoy, nroTicket, useSesion, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { Muestra } from '../MapleVista';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando, Entrada } from '../ui';

interface Resumen {
  produccion: { maquina: string; codigo: string; variante: string; colorHex: string | null; partes: number; minutos: number; paquetes: number; pulpeadas: number; maples: number; paquetesTeoricos: number | null }[];
  consumo: { nombre: string; unidad: Unidad; teorico: number; real: number }[];
  porTurno: { turno: Turno; paquetes: number; minutos: number }[];
}
interface ParteFila { id: string; numero: number; fecha: string; turno: Turno; minutos: number; paquetes: number; anuladoAt: string | null; codigo: string; variante: string; colorHex: string | null; maquina: string }

const haceDias = (n: number) => { const d = new Date(hoy() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const porHora = (paq: number, min: number) => (min ? (paq / (min / 60)).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—');

/** La planilla productiva: cuánto se hizo, en cuánto tiempo, qué se gastó y contra qué debería haberse gastado. */
export function Produccion() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ desde: haceDias(6), hasta: hoy(), q: '' });
  const { desde, hasta } = f;
  const q = useDemorado(f.q);
  const setDesde = (desde: string) => setF({ desde });
  const setHasta = (hasta: string) => setF({ hasta });
  const { data: r } = useQuery({ queryKey: ['partes-resumen', desde, hasta], queryFn: () => api<Resumen>(`/partes/resumen?desde=${desde}&hasta=${hasta}`) });
  const { data: horas } = useQuery({ queryKey: ['horas', desde, hasta], queryFn: () => api<{ id: string; nombre: string; minutos: number; manana: number; tarde: number; dias: number; partes: number; estimado: number | null }[]>(`/horas?desde=${desde}&hasta=${hasta}`) });
  const { data: partes, isLoading } = useQuery({ queryKey: ['partes', desde, hasta, q], queryFn: () => api<ParteFila[]>(`/partes?desde=${desde}&hasta=${hasta}&q=${encodeURIComponent(q)}`) });
  const tot = (r?.produccion ?? []).reduce((a, p) => ({ paquetes: a.paquetes + p.paquetes, minutos: a.minutos + p.minutos, maples: a.maples + p.maples, partes: a.partes + p.partes }), { paquetes: 0, minutos: 0, maples: 0, partes: 0 });

  return (
    <div className="ancho" style={{ display: 'grid', gap: 28 }}>
      <Cabecera titulo="Producción" bajada="Lo que hizo cada máquina, cuánto rindió y qué se gastó.">
        {puede('produccion', 2) && <Link to="/produccion/nuevo" className="boton primario"><Plus size={18} aria-hidden /> Cargar parte</Link>}
      </Cabecera>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label className="campo"><span>Desde</span><Entrada type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
        <BotonExportar que="produccion" desde={desde} hasta={hasta} />
        <div className="pestanas" role="group" aria-label="Rango rápido" style={{ alignSelf: 'center' }}>
          {([['Hoy', 0], ['7 días', 6], ['30 días', 29]] as const).map(([t, n]) => (
            <button key={t} aria-pressed={desde === haceDias(n) && hasta === hoy()} onClick={() => setF({ desde: haceDias(n), hasta: hoy() })}>{t}</button>
          ))}
        </div>
      </div>

      <div className="cifras">
        <div><span className="cifra">{tot.paquetes.toLocaleString('es-AR')}</span><small>paquetes</small></div>
        <div><span className="cifra">{tot.maples.toLocaleString('es-AR')}</span><small>maples</small></div>
        <div><span className="cifra">{formatMinutos(tot.minutos)}</span><small>de máquina en {tot.partes} partes</small></div>
        <div><span className="cifra">{porHora(tot.paquetes, tot.minutos)}</span><small>paquetes por hora, promedio</small></div>
      </div>

      {r && r.produccion.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Por máquina y maple</h3></div>
          {r.produccion.map((p) => {
            const rinde = p.paquetesTeoricos ? Math.round((p.paquetes / p.paquetesTeoricos) * 100) : null;
            return (
              <div className="fila" key={p.maquina + p.codigo}>
                <div className="con-muestra">
                  <Muestra color={p.colorHex} />
                  <div><div className="principal">{p.maquina} · {p.codigo}</div><div className="chico tenue">{p.partes} partes · {formatMinutos(p.minutos)} · {porHora(p.paquetes, p.minutos)} paq./h · {p.pulpeadas} pulpeadas</div></div>
                </div>
                <div className="derecha">
                  <div className="cifra">{p.paquetes.toLocaleString('es-AR')} paq.</div>
                  {rinde !== null && <span className={`marca-texto ${rinde >= 95 ? 'ok' : rinde >= 80 ? 'alerta' : 'peligro'}`}>Rinde {rinde} %</span>}
                </div>
              </div>
            );
          })}
          {r.porTurno.length > 0 && (
            <div className="fila"><span className="tenue">Por turno</span><span>{r.porTurno.map((t) => `${LABEL_TURNO[t.turno]}: ${t.paquetes.toLocaleString('es-AR')} paq. (${porHora(t.paquetes, t.minutos)}/h)`).join(' · ')}</span></div>
          )}
        </section>
      )}

      {r && r.consumo.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Materia prima usada</h3><span className="chico tenue">real contra receta</span></div>
          {r.consumo.map((c) => {
            const desvio = c.teorico ? Math.round(((c.real - c.teorico) / c.teorico) * 100) : null;
            return (
              <div className="fila" key={c.nombre}>
                <div><div className="principal">{c.nombre}</div><div className="chico tenue">Receta: {formatCantidad(c.teorico, c.unidad)}</div></div>
                <div className="derecha">
                  <div className="cifra">{formatCantidad(c.real, c.unidad)}</div>
                  {desvio !== null && desvio !== 0 && <span className={`chico ${desvio > 0 ? 'desvio-mas' : 'desvio-menos'}`}>{desvio > 0 ? '+' : ''}{desvio} % contra receta</span>}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {horas && horas.some((h) => h.minutos > 0) && (
        <section className="hoja">
          <div className="fila"><div><h3>Horas por persona</h3><p className="chico tenue">Las horas de máquina de los partes en que figura cada uno.</p></div><BotonExportar que="horas" desde={desde} hasta={hasta} texto="Exportar" /></div>
          {horas.filter((h) => h.minutos > 0).map((h) => (
            <div className="fila" key={h.id}>
              <div><div className="principal">{h.nombre}</div><div className="chico tenue">{h.dias} días · {h.partes} partes · mañana {formatMinutos(h.manana)} · tarde {formatMinutos(h.tarde)}</div></div>
              <div className="derecha"><div className="cifra">{formatMinutos(h.minutos)}</div>{h.estimado !== null && <div className="chico tenue">{formatPesos(h.estimado)} estimado</div>}</div>
            </div>
          ))}
        </section>
      )}

      <section>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h3>Partes</h3>
          <div style={{ flex: 1, minWidth: 220 }}><Buscador placeholder="Buscar código, máquina o n.º de parte" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar partes" /></div>
        </div>
        {isLoading ? <Cargando /> : !partes?.length ? <div className="hoja vacio"><p>No hay partes cargados en estas fechas.</p></div> : (
          <div className="hoja filas">
            {partes.map((p) => (
              <Link key={p.id} to={`/produccion/${p.id}`} className={`fila${p.anuladoAt ? ' anulada' : ''}`}>
                <div className="con-muestra">
                  <Muestra color={p.colorHex} />
                  <div><div className="principal">{p.maquina} · {p.codigo}</div><div className="chico tenue">{verFecha(p.fecha)}, turno {LABEL_TURNO[p.turno].toLowerCase()} · Parte {nroTicket(p.numero)} · {formatMinutos(p.minutos)}</div></div>
                </div>
                <div className="derecha"><div className="cifra">{p.paquetes} paq.</div>{p.anuladoAt && <span className="marca-texto peligro">Anulado</span>}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
