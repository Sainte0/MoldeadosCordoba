import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { formatCantidad, formatMinutos, LABEL_TURNO, type Turno, type Unidad } from '@moldeados/shared';
import { api, hoy, nroTicket, useSesion, verFecha } from '../api';
import { Muestra } from '../MapleVista';
import { Cabecera, Cargando, Entrada } from '../ui';

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
  const [desde, setDesde] = useState(haceDias(6));
  const [hasta, setHasta] = useState(hoy());
  const { data: r } = useQuery({ queryKey: ['partes-resumen', desde, hasta], queryFn: () => api<Resumen>(`/partes/resumen?desde=${desde}&hasta=${hasta}`) });
  const { data: partes, isLoading } = useQuery({ queryKey: ['partes', desde, hasta], queryFn: () => api<ParteFila[]>(`/partes?desde=${desde}&hasta=${hasta}`) });
  const tot = (r?.produccion ?? []).reduce((a, p) => ({ paquetes: a.paquetes + p.paquetes, minutos: a.minutos + p.minutos, maples: a.maples + p.maples, partes: a.partes + p.partes }), { paquetes: 0, minutos: 0, maples: 0, partes: 0 });

  return (
    <div className="ancho" style={{ display: 'grid', gap: 28 }}>
      <Cabecera titulo="Producción" bajada="Lo que hizo cada máquina, cuánto rindió y qué se gastó.">
        {puede('produccion', 2) && <Link to="/produccion/nuevo" className="boton primario"><Plus size={18} aria-hidden /> Cargar parte</Link>}
      </Cabecera>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label className="campo"><span>Desde</span><Entrada type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
        {[['Hoy', 0], ['7 días', 6], ['30 días', 29]].map(([t, n]) => (
          <button key={t} className="boton secundario" onClick={() => { setDesde(haceDias(n as number)); setHasta(hoy()); }}>{t}</button>
        ))}
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

      <section>
        <h3 style={{ marginBottom: 12 }}>Partes</h3>
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
