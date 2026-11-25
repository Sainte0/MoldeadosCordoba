import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aCentavos, aMili, formatCantidad, formatPesos, subtotalItem, type Unidad } from '@moldeados/shared/base';
import { api, hoy, useSesion } from '../api';
import { useProveedores, type MateriaPrima } from '../datos';
import { Aviso, Campo, Confirmar, Dialogo, Entrada } from '../ui';
import { Cuenta } from './Planilla';

// Tocar una materia prima (en Hoy o en Planta › Materia prima): anotar que entró (una compra) o corregir lo que hay.
// Las dos cosas mueven stock (y la compra, la cuenta del proveedor): se confirman en un diálogo aparte.

export function MateriaRapida({ m, onCerrar, inicial }: { m: MateriaPrima; onCerrar: () => void; inicial?: 'entro' | 'corregir' }) {
  const { puede } = useSesion();
  const puedeComprar = puede('compras', 2);
  const puedeCorregir = puede('materias', 3);
  const [modo, setModo] = useState<'entro' | 'corregir'>(inicial ?? (puedeComprar ? 'entro' : 'corregir'));
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
  // Proveedor: se elige de la lista; "Proveedor nuevo" abre el campo del nombre (los datos se completan después en Proveedores).
  const [r, setR] = useState({ cantidad: '', proveedorId: '', nuevo: '', precio: '', conFactura: m.tipo !== 'carton' });
  const esNuevo = r.proveedorId === 'nuevo' || (proveedores !== undefined && proveedores.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const cantidad = aMili(r.cantidad);
  const precio = aCentavos(r.precio);
  const nombreProv = esNuevo ? r.nuevo.trim() : (proveedores ?? []).find((p) => p.id === r.proveedorId)?.nombre ?? '';
  const revisar = (e: React.FormEvent) => {
    e.preventDefault();
    if (esNuevo ? !r.nuevo.trim() : !r.proveedorId) return setError(esNuevo ? 'Escribí el nombre del proveedor nuevo' : 'Elegí el proveedor');
    if (!cantidad || cantidad <= 0) return setError(`Ingresá cuántos ${unidad} entraron`);
    if (precio === null) return setError(`Ingresá el precio por ${unidad}`);
    setError(null); setRevisando(true);
  };
  const guardar = async () => {
    // Si el "nuevo" ya existía con ese nombre, se usa ese (no se duplica).
    const existente = esNuevo ? (proveedores ?? []).find((p) => p.nombre.toLowerCase() === nombreProv.toLowerCase()) : { id: r.proveedorId };
    const prov = existente ?? await api<{ id: string }>('/proveedores', { method: 'POST', body: { nombre: nombreProv, tipos: [m.tipo] } });
    await api('/compras', { method: 'POST', body: { proveedorId: prov.id, fecha: hoy(), conFactura: r.conFactura, ivaBp: 2100, items: [{ materiaPrimaId: m.id, cantidad, precioUnitario: precio }] } });
    await qc.invalidateQueries();
    onListo();
  };
  return (
    <form onSubmit={revisar} style={{ display: 'grid', gap: 14 }}>
      {!!proveedores?.length && (
        <Campo etiqueta="Proveedor">
          <select className="entrada" value={r.proveedorId} onChange={(e) => setR({ ...r, proveedorId: e.target.value })} required>
            <option value="" disabled>Elegí el proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            <option value="nuevo">+ Proveedor nuevo…</option>
          </select>
        </Campo>
      )}
      {esNuevo && (
        <Campo etiqueta="Nombre del proveedor nuevo" ayuda="Queda en Proveedores; el resto de sus datos se completa ahí.">
          <Entrada value={r.nuevo} onChange={(e) => setR({ ...r, nuevo: e.target.value })} placeholder="Nombre o razón social" autoComplete="off" autoFocus={r.proveedorId === 'nuevo'} required />
        </Campo>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Campo etiqueta={`Cuántos ${unidad}`}><Entrada inputMode="decimal" value={r.cantidad} onChange={(e) => setR({ ...r, cantidad: e.target.value.replace(/[^\d,]/g, '') })} required /></Campo>
        <Campo etiqueta={`$ por ${unidad}`}><Entrada inputMode="decimal" value={r.precio} onChange={(e) => setR({ ...r, precio: e.target.value.replace(/[^\d,]/g, '') })} placeholder="Sin IVA" required /></Campo>
      </div>
      <Cuenta valor={r.conFactura} onChange={(conFactura) => setR({ ...r, conFactura })} />
      {cantidad && precio !== null ? <p className="chico tenue">Total sin IVA: {formatPesos(subtotalItem(cantidad, precio))}. Se suma al stock y a la cuenta del proveedor.</p> : null}
      <Aviso>{error}</Aviso>
      {revisando && cantidad && precio !== null && (
        <Confirmar titulo={`¿Anotar que entró ${m.nombre.toLowerCase()}?`} texto="Sí, anotar" onSi={guardar} onNo={() => setRevisando(false)}>
          <p><b>{formatCantidad(cantidad, m.unidad as Unidad)}</b> de {nombreProv}{esNuevo ? ' (proveedor nuevo)' : ''} · {r.conFactura ? 'Cuenta 1' : 'Cuenta 2'}</p>
          <p className="tenue">Total sin IVA {formatPesos(subtotalItem(cantidad, precio))}. Se suma al stock y a la cuenta del proveedor.</p>
        </Confirmar>
      )}
      <div className="acciones">
        <button type="button" className="boton secundario" onClick={onListo}>Cancelar</button>
        <button className="boton primario">Revisar y anotar</button>
      </div>
    </form>
  );
}

function Corregir({ m, unidad, onListo }: { m: MateriaPrima; unidad: string; onListo: () => void }) {
  const qc = useQueryClient();
  const [hay, setHay] = useState('');
  const [motivo, setMotivo] = useState('Conté lo que hay');
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const nuevo = aMili(hay);
  const diferencia = nuevo === null ? null : nuevo - m.stock;
  const revisar = (e: React.FormEvent) => {
    e.preventDefault();
    if (nuevo === null || nuevo < 0) return setError(`Ingresá cuántos ${unidad} hay`);
    if (diferencia === 0) return onListo();
    setError(null); setRevisando(true);
  };
  const guardar = async () => {
    await api(`/materias/${m.id}/ajuste`, { method: 'POST', body: { cantidad: diferencia, nota: motivo.trim() || 'Corrección' } });
    await qc.invalidateQueries();
    onListo();
  };
  return (
    <form onSubmit={revisar} style={{ display: 'grid', gap: 14 }}>
      <Campo etiqueta={`¿Cuántos ${unidad} hay de verdad?`}><Entrada inputMode="decimal" value={hay} onChange={(e) => setHay(e.target.value.replace(/[^\d,]/g, ''))} autoFocus required /></Campo>
      <Campo etiqueta="Por qué" ayuda="Queda en el registro de cambios."><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      {diferencia !== null && diferencia !== 0 && <p className="chico tenue">{diferencia > 0 ? 'Suma' : 'Resta'} {formatCantidad(Math.abs(diferencia), m.unidad as Unidad)}.</p>}
      <Aviso>{error}</Aviso>
      {revisando && nuevo !== null && diferencia !== null && (
        <Confirmar titulo={`¿Dejar ${m.nombre.toLowerCase()} en ${formatCantidad(nuevo, m.unidad as Unidad)}?`} texto="Sí, corregir" onSi={guardar} onNo={() => setRevisando(false)}>
          <p className="tenue">Hay {formatCantidad(Math.max(0, m.stock), m.unidad as Unidad)} cargados: {diferencia > 0 ? 'se suman' : 'se restan'} {formatCantidad(Math.abs(diferencia), m.unidad as Unidad)}. Queda registrado con tu nombre.</p>
        </Confirmar>
      )}
      <div className="acciones">
        <button type="button" className="boton secundario" onClick={onListo}>Cancelar</button>
        <button className="boton primario">Revisar y corregir</button>
      </div>
    </form>
  );
}
