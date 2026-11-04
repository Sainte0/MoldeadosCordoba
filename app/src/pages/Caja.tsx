import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, Plus } from 'lucide-react';
import { aCentavos, formatPesos } from '@moldeados/shared';
import { api, hoy, useSesion, verFecha } from '../api';
import { useCaja } from '../datos';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero } from '../ui';

const MOTIVO: Record<string, string> = { reposicion: 'Reposición', gasto: 'Gasto', anulacion_gasto: 'Gasto anulado', arqueo: 'Arqueo' };

/** Caja chica: la plata en efectivo de la planta. Se repone, salen gastos, y cada tanto se cuenta (arqueo). */
export function Caja() {
  const { puede } = useSesion();
  const { data, isLoading } = useCaja();
  const [dialogo, setDialogo] = useState<'reposicion' | 'arqueo' | null>(null);
  if (isLoading || !data) return <Cargando />;

  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Link to="/gastos" className="boton fantasma" style={{ justifySelf: 'start' }}><ArrowLeft size={18} aria-hidden /> Gastos</Link>
      <Cabecera titulo="Caja chica" bajada="Los gastos pagados con caja chica se descuentan solos." />
      <div className="lectura"><span>Tiene que haber</span><span className="cifra">{formatPesos(data.saldo)}</span></div>
      {puede('gastos', 3) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="boton primario grande" onClick={() => setDialogo('reposicion')}><Plus size={20} aria-hidden /> Reponer caja</button>
          <button className="boton secundario grande" onClick={() => setDialogo('arqueo')}><Calculator size={20} aria-hidden /> Contar la caja</button>
        </div>
      )}
      <div className="hoja filas">
        {!data.movimientos.length && <p className="tenue" style={{ padding: 16 }}>Sin movimientos. Empezá cargando una reposición con lo que hay hoy en la caja.</p>}
        {data.movimientos.map((m) => (
          <div className="fila" key={m.id}>
            <div><div className="principal">{m.concepto}</div><div className="chico tenue">{verFecha(m.fecha)} · {MOTIVO[m.motivo]} · {m.usuario}</div></div>
            <span className="cifra" style={{ color: m.monto > 0 ? 'var(--ok)' : 'var(--peligro)' }}>{m.monto > 0 ? '+' : '−'} {formatPesos(Math.abs(m.monto))}</span>
          </div>
        ))}
      </div>
      {dialogo && <Movimiento tipo={dialogo} saldo={data.saldo} onCerrar={() => setDialogo(null)} />}
    </div>
  );
}

function Movimiento({ tipo, saldo, onCerrar }: { tipo: 'reposicion' | 'arqueo'; saldo: number; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState(tipo === 'reposicion' ? 'Reposición de caja' : '');
  const [error, setError] = useState<string | null>(null);
  const contado = aCentavos(monto);
  const diferencia = tipo === 'arqueo' && contado !== null ? contado - saldo : null;

  const guardar = async () => {
    setError(null);
    const m = tipo === 'reposicion' ? contado : diferencia;
    if (!m) return setError(tipo === 'arqueo' && diferencia === 0 ? 'La caja coincide: no hay nada que corregir.' : 'Ingresá el monto');
    try {
      await api('/caja', { method: 'POST', body: { fecha: hoy(), motivo: tipo, monto: m, concepto: concepto || (m > 0 ? 'Sobrante en el arqueo' : 'Faltante en el arqueo') } });
      await qc.invalidateQueries({ queryKey: ['caja'] });
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  return (
    <Dialogo titulo={tipo === 'reposicion' ? 'Reponer caja' : 'Contar la caja'} onCerrar={onCerrar}>
      <p className="tenue">{tipo === 'reposicion' ? 'Cuánta plata se puso en la caja.' : `Contá la plata y anotá cuánto hay. Según el sistema tiene que haber ${formatPesos(saldo)}.`}</p>
      <EntradaNumero enorme unidad="$" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus aria-label={tipo === 'reposicion' ? 'Monto repuesto' : 'Monto contado'} />
      {diferencia !== null && diferencia !== 0 && <Aviso ok={diferencia > 0}>{diferencia > 0 ? `Sobran ${formatPesos(diferencia)}` : `Faltan ${formatPesos(-diferencia)}`}. Se registra la diferencia.</Aviso>}
      {diferencia === 0 && <Aviso ok>La caja coincide.</Aviso>}
      <Campo etiqueta="Concepto"><Entrada value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={tipo === 'arqueo' ? 'Ej.: conteo del viernes' : ''} /></Campo>
      <Aviso>{error}</Aviso>
      <div className="acciones"><button className="boton secundario" onClick={onCerrar}>Cancelar</button><button className="boton primario" onClick={guardar}>Guardar</button></div>
    </Dialogo>
  );
}
