import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Layers } from 'lucide-react';
import { formatCantidad, formatMinutos, LABEL_TURNO, paquetesTeoricos, type Turno, type Unidad } from '@moldeados/shared';
import { api, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { MapleVista } from '../MapleVista';
import { Aviso, Campo, Cargando, Dialogo } from '../ui';

interface Detalle {
  id: string; numero: number; fecha: string; turno: Turno; minutos: number; pulpeadas: number; paquetes: number; maplesPorHora: number; maplesPorPaquete: number;
  notas: string | null; cargadoAt: string; anuladoAt: string | null; motivoAnulacion: string | null; anuladoPor: string | null; cargadoPor: string;
  codigo: string; variante: string; colorHex: string | null; maquina: string; maquinaNombre: string;
  personal: string[]; consumos: { nombre: string; unidad: Unidad; teorico: number; real: number }[]; palets: { id: string; numero: number; paquetes: number }[];
}

export function ParteDetalle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['parte', id], queryFn: () => api<Detalle>(`/partes/${id}`) });
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (!p) return <Aviso>{error instanceof Error ? error.message : 'No encontramos ese parte'}</Aviso>;
  const esperado = paquetesTeoricos(p.maplesPorHora, p.minutos, p.maplesPorPaquete);

  const anular = async () => {
    setErr(null);
    try {
      await api(`/partes/${p.id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      setAnulando(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular');
    }
  };

  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Link to="/produccion" className="boton fantasma" style={{ justifySelf: 'start' }}><ArrowLeft size={18} aria-hidden /> Producción</Link>
      {params.get('nuevo') && !p.anuladoAt && (
        <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Parte guardado. Los paquetes ya están en stock y la materia prima descontada.</div>
      )}
      <MapleVista color={p.colorHex} alto={200} />
      <header>
        <h1>{p.codigo}, {p.paquetes} paquetes</h1>
        <p className="tenue" style={{ marginTop: 6 }}>Parte {nroTicket(p.numero)} · {p.maquina} · {verFecha(p.fecha)}, turno {LABEL_TURNO[p.turno].toLowerCase()}</p>
      </header>
      {p.anuladoAt && <Aviso>Anulado por {p.anuladoPor}, {verMomento(p.anuladoAt)}: {p.motivoAnulacion}</Aviso>}

      <dl className="resumen hoja relleno">
        <dt>Maple</dt><dd>{p.variante}</dd>
        <dt>Máquina</dt><dd>{p.maquina}, {p.maquinaNombre}</dd>
        <dt>Personal</dt><dd>{p.personal.join(', ')}</dd>
        <dt>Tiempo</dt><dd>{formatMinutos(p.minutos)} · {p.pulpeadas} pulpeadas</dd>
        <dt>Maples</dt><dd className="cifra">{(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')}</dd>
        {esperado !== null && <><dt>Rendimiento</dt><dd>{esperado ? Math.round((p.paquetes / esperado) * 100) : 0} % (se esperaban {esperado} paquetes)</dd></>}
        {p.notas && <><dt>Notas</dt><dd>{p.notas}</dd></>}
      </dl>

      {p.consumos.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Materia prima</h3><span className="chico tenue">usado / receta</span></div>
          {p.consumos.map((c) => (
            <div className="fila" key={c.nombre}>
              <span className="principal">{c.nombre}</span>
              <span><span className="cifra">{formatCantidad(c.real, c.unidad)}</span> <span className="tenue chico">/ {formatCantidad(c.teorico, c.unidad)}</span></span>
            </div>
          ))}
        </section>
      )}

      {p.palets.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>En palets</h3></div>
          {p.palets.map((pa) => <Link key={pa.id} to={`/palets/${pa.id}`} className="fila"><span>Palet {nroTicket(pa.numero)}</span><span className="cifra">{pa.paquetes} paq.</span></Link>)}
        </section>
      )}
      <p className="chico tenue">Cargado por {p.cargadoPor}, {verMomento(p.cargadoAt)}</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {!p.anuladoAt && puede('produccion', 2) && <Link to="/palets/nuevo" className="boton primario grande"><Layers size={20} aria-hidden /> Armar palet</Link>}
        {!p.anuladoAt && puede('produccion', 3) && <button className="boton secundario" onClick={() => setAnulando(true)}><Ban size={18} aria-hidden /> Anular</button>}
      </div>

      {anulando && (
        <Dialogo titulo={`Anular parte ${nroTicket(p.numero)}`} onCerrar={() => setAnulando(false)}>
          <p className="tenue">Se sacan los paquetes del stock y se devuelve la materia prima. Queda registrado como anulado, con tu nombre y el motivo.</p>
          <Campo etiqueta="Motivo"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
          <Aviso>{err}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setAnulando(false)}>Volver</button>
            <button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Anular</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
