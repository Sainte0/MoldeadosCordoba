import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aCentavos, aMili, formatCantidad, formatPesos, subtotalItem, type Unidad } from '@moldeados/shared/base';
import { api, hoy, useSesion } from '../api';
import { useProveedores, type MateriaPrima } from '../datos';
import { Aviso, Campo, Dialogo, Entrada } from '../ui';

// Tocar una materia prima en "Hoy": anotar que entró (una compra) o corregir lo que hay, sin ir a otra pantalla.

export function MateriaRapida({ m, onCerrar }: { m: MateriaPrima; onCerrar: () => void }) {
  const { puede } = useSesion();
  const puedeComprar = puede('compras', 2);
  const puedeCorregir = puede('materias', 3);
  const [modo, setModo] = useState<'entro' | 'corregir'>(puedeComprar ? 'entro' : 'corregir');
  const unidad = m.unidad === 'kg' ? 'kg' : 'L';
  return (
    <Dialogo titulo={m.nombre} onCerrar={onCerrar}>
      <p className="tenue">Hay {formatCantidad(Math.max(0, m.stock), m.unidad as Unidad)} ahora.</p>
      {puedeComprar && puedeCorregir && (
        <div className="pestanas" role="group" aria-label="Qué hacer">
          <button type="button" aria-pressed={modo === 'entro'} onClick={() => setModo('entro')}>Entró (se compró)</button>
          <button type="button" aria-pressed={modo === 'corregir'} onClick={() => setModo('corregir')}>Corregir lo que hay</button>
        </div>
      )}
      {modo === 'entro' ? <Entro m={m} unidad={unidad} onListo={onCerrar} /> : <Corregir m={m} unidad={unidad} onListo={onCerrar} />}
    </Dialogo>
  );
}

function Entro({ m, unidad, onListo }: { m: MateriaPrima; unidad: string; onListo: () => void }) {
  const qc = useQueryClient();
  const { data: proveedores } = useProveedores('', m.tipo);
  const [r, setR] = useState({ cantidad: '', proveedor: '', precio: '', conFactura: m.tipo !== 'carton' });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cantidad = aMili(r.cantidad);
  const precio = aCentavos(r.precio);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cantidad || cantidad <= 0) return setError(`Ingresá cuántos ${unidad} entraron`);
    if (precio === null) return setError(`Ingresá el precio por ${unidad}`);
    setError(null); setGuardando(true);
    try {
      const nombre = r.proveedor.trim();
      // Escribiendo el nombre: si existe se usa; si no, se crea (los datos se completan después en Proveedores).
      const existente = (proveedores ?? []).find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
      const prov = existente ?? await api<{ id: string }>('/proveedores', { method: 'POST', body: { nombre, tipos: [m.tipo] } });
      await api('/compras', { method: 'POST', body: { proveedorId: prov.id, fecha: hoy(), conFactura: r.conFactura, ivaBp: 2100, items: [{ materiaPrimaId: m.id, cantidad, precioUnitario: precio }] } });
      await qc.invalidateQueries();
      onListo();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    setGuardando(false);
  };
  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Campo etiqueta={`Cuántos ${unidad}`}><Entrada inputMode="decimal" value={r.cantidad} onChange={(e) => setR({ ...r, cantidad: e.target.value.replace(/[^\d,]/g, '') })} autoFocus required /></Campo>
        <Campo etiqueta={`$ por ${unidad}`}><Entrada inputMode="decimal" value={r.precio} onChange={(e) => setR({ ...r, precio: e.target.value.replace(/[^\d,]/g, '') })} placeholder="Sin IVA" required /></Campo>
      </div>
      <Campo etiqueta="Proveedor">
        <Entrada list="rapida-proveedores" value={r.proveedor} onChange={(e) => setR({ ...r, proveedor: e.target.value })} placeholder="Nombre" autoComplete="off" required />
        <datalist id="rapida-proveedores">{(proveedores ?? []).map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
      </Campo>
      <label className="planilla-check"><input type="checkbox" checked={r.conFactura} onChange={(e) => setR({ ...r, conFactura: e.target.checked })} /> Con factura</label>
      {cantidad && precio !== null ? <p className="chico tenue">Total sin IVA: {formatPesos(subtotalItem(cantidad, precio))}. Se suma al stock y a la cuenta del proveedor.</p> : null}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button type="button" className="boton secundario" onClick={onListo}>Cancelar</button>
        <button className="boton primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

function Corregir({ m, unidad, onListo }: { m: MateriaPrima; unidad: string; onListo: () => void }) {
  const qc = useQueryClient();
  const [hay, setHay] = useState('');
  const [motivo, setMotivo] = useState('Conté lo que hay');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const nuevo = aMili(hay);
  const diferencia = nuevo === null ? null : nuevo - m.stock;
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nuevo === null || nuevo < 0) return setError(`Ingresá cuántos ${unidad} hay`);
    if (diferencia === 0) return onListo();
    setError(null); setGuardando(true);
    try {
      await api(`/materias/${m.id}/ajuste`, { method: 'POST', body: { cantidad: diferencia, nota: motivo.trim() || 'Corrección' } });
      await qc.invalidateQueries();
      onListo();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    setGuardando(false);
  };
  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 14 }}>
      <Campo etiqueta={`¿Cuántos ${unidad} hay de verdad?`}><Entrada inputMode="decimal" value={hay} onChange={(e) => setHay(e.target.value.replace(/[^\d,]/g, ''))} autoFocus required /></Campo>
      <Campo etiqueta="Por qué" ayuda="Queda en el registro de cambios."><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      {diferencia !== null && diferencia !== 0 && <p className="chico tenue">{diferencia > 0 ? 'Suma' : 'Resta'} {formatCantidad(Math.abs(diferencia), m.unidad as Unidad)}.</p>}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button type="button" className="boton secundario" onClick={onListo}>Cancelar</button>
        <button className="boton primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}
