import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { aCentavos, CONDICIONES, formatPesos, LABEL_CONDICION, LABEL_VEHICULO, VEHICULOS, verCondicion, type Condicion, type Vehiculo } from '@moldeados/shared/base';
import { api, useSesion, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useClientes, useVariantes, type Cliente } from '../datos';
import { ParaVender } from './Avisos';
import { Aviso, Buscador, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones, Confirmar } from '../ui';

const VACIO: Omit<Cliente, 'id'> = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', vehiculoHabitual: null, notas: '', condicionPago: 'cuenta1', porcentajeCuenta1: null };

export function Clientes() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ q: '', ver: 'lista' });
  const { data: variantes } = useVariantes();
  const { data, isLoading } = useClientes(useDemorado(f.q));
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null);
  return (
    <div className="ancho">
      <Cabecera titulo="Clientes" bajada="Granjas, distribuidores y todo el que compra maples.">
        {puede('ventas', 2) && <button className="boton primario" onClick={() => setEditando({ ...VACIO })}><Plus size={18} aria-hidden /> Nuevo cliente</button>}
      </Cabecera>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="pestanas" role="group" aria-label="Cómo ver">
          {([['lista', 'Lista'], ['tabla', 'Precios'], ['vender', 'Para llamar']] as const).map(([v, t]) => <button key={v} aria-pressed={f.ver === v} onClick={() => setF({ ver: v })}>{t}</button>)}
        </div>
        {f.ver !== 'vender' && <div style={{ flex: 1, minWidth: 220 }}><Buscador placeholder="Buscar por nombre" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar cliente" /></div>}
      </div>
      {/* Los que dejaron de comprar, en su pestaña: arriba de la lista empujaban a los clientes fuera de la pantalla. */}
      {f.ver === 'vender' ? <ParaVender onFicha={(id) => { const c = data?.find((x) => x.id === id); if (c) setEditando(c); }} /> : isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>{f.q ? 'Nadie con ese nombre.' : 'Todavía no hay clientes. Se agregan acá o al vender.'}</p></div> : f.ver === 'tabla' ? (
        // Todos los clientes juntos con su precio acordado por maple y su condición de pago.
        <div className="hoja tabla-scroll">
          <table className="tabla-balance">
            <thead><tr><th>Cliente</th><th>Condición</th>{(variantes ?? []).filter((v) => v.activo).map((v) => <th key={v.id} className="num">{v.codigo}</th>)}</tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} onClick={() => setEditando(c)} style={{ cursor: 'pointer' }}>
                  <td><b>{c.nombre}</b></td>
                  <td>{verCondicion(c.condicionPago, c.porcentajeCuenta1)}</td>
                  {(variantes ?? []).filter((v) => v.activo).map((v) => <td key={v.id} className="num">{c.precios?.[v.id] !== undefined ? formatPesos(c.precios[v.id]!) : <span className="tenue">lista</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hoja filas">
          {data.map((c) => (
            <button key={c.id} className="fila" onClick={() => setEditando(c)}>
              {/* Todo a la izquierda: con la fecha a la derecha, el nombre quedaba en tres renglones en el iPhone. */}
              <div><div className="principal">{c.nombre}</div><div className="chico tenue">{[c.ultimaVenta ? `Última compra ${verFecha(c.ultimaVenta)}` : 'Sin compras', LABEL_CONDICION[c.condicionPago], c.telefono].filter(Boolean).join(' · ')}</div></div>
              <ChevronRight size={18} aria-hidden className="tenue" />
            </button>
          ))}
        </div>
      )}
      {editando && <FichaCliente inicial={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

interface Especial { varianteId: string; codigo: string; colorHex: string | null; precioMaple: number; precioLista: number }

function FichaCliente({ inicial, onCerrar }: { inicial: Partial<Cliente>; onCerrar: () => void }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const nuevo = !inicial.id;
  const editable = nuevo ? puede('ventas', 2) : puede('ventas', 3);
  const [c, setC] = useState({ ...VACIO, ...inicial });
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const { data: det } = useQuery({ queryKey: ['cliente', inicial.id], queryFn: () => api<Cliente & { especiales: Especial[] }>(`/clientes/${inicial.id}`), enabled: !nuevo });
  const { data: lista } = useQuery({ queryKey: ['precios'], queryFn: () => api<{ id: string; codigo: string; activo: boolean; precioMaple: number }[]>('/precios') });
  // Precio acordado por maple: lo escrito; vacío = se le cobra el de lista.
  const [precios, setPrecios] = useState<Record<string, string> | null>(null);
  const actuales = Object.fromEntries((det?.especiales ?? []).map((e) => [e.varianteId, e.precioMaple]));
  const valorPrecio = (id: string) => precios?.[id] ?? (actuales[id] !== undefined ? String(actuales[id] / 100).replace('.', ',') : '');

  const campo = (k: 'nombre' | 'cuit' | 'telefono' | 'email' | 'direccion', etiqueta: string, extra: object = {}) => (
    <Campo etiqueta={etiqueta}><Entrada value={c[k] ?? ''} disabled={!editable} onChange={(e) => setC({ ...c, [k]: e.target.value })} {...extra} /></Campo>
  );
  const guardar = async () => {
    setError(null);
    try {
      const cambiados = Object.entries(precios ?? {}).map(([varianteId, t]) => ({ varianteId, precioMaple: t.trim() ? aCentavos(t) : null }));
      if (cambiados.some((p) => p.precioMaple !== null && (p.precioMaple === undefined || p.precioMaple < 0 || Number.isNaN(p.precioMaple)))) return setError('Hay un precio que no se entiende. Escribilo así: 110 o 110,50');
      const body = {
        nombre: c.nombre, cuit: c.cuit || undefined, telefono: c.telefono || undefined, email: c.email || undefined, direccion: c.direccion || undefined, vehiculoHabitual: c.vehiculoHabitual, notas: c.notas || undefined,
        condicionPago: c.condicionPago, porcentajeCuenta1: c.condicionPago === 'mixta' ? c.porcentajeCuenta1 : null, precios: cambiados,
      };
      await api(nuevo ? '/clientes' : `/clientes/${inicial.id}`, { method: nuevo ? 'POST' : 'PUT', body });
      await qc.invalidateQueries({ queryKey: ['clientes'] });
      await qc.invalidateQueries({ queryKey: ['cliente', inicial.id] });
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  const eliminar = async () => {
    try {
      await api(`/clientes/${inicial.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['clientes'] });
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo dar de baja'); }
  };

  return (
    <Dialogo titulo={nuevo ? 'Nuevo cliente' : c.nombre} onCerrar={onCerrar}>
      {!nuevo && puede('cuentas') && <Link to={`/cuentas/cliente/${inicial.id}`} className="boton secundario" style={{ justifySelf: 'start' }}>Ver cuenta corriente</Link>}
      {campo('nombre', 'Nombre o razón social', { autoFocus: nuevo })}
      {campo('cuit', 'CUIT', { inputMode: 'numeric' })}
      {campo('telefono', 'Teléfono', { type: 'tel' })}
      {campo('email', 'Email', { type: 'email' })}
      {campo('direccion', 'Dirección')}
      <Campo etiqueta="Suele retirar en" ayuda="Se propone al vender">
        <Opciones<Vehiculo | null> columnas valor={c.vehiculoHabitual} onChange={(v) => editable && setC({ ...c, vehiculoHabitual: v })} opciones={[{ valor: null, titulo: 'Varía' }, ...VEHICULOS.map((v) => ({ valor: v, titulo: LABEL_VEHICULO[v] }))]} />
      </Campo>
      <Campo etiqueta="Observaciones"><textarea className="entrada" value={c.notas ?? ''} disabled={!editable} onChange={(e) => setC({ ...c, notas: e.target.value })} /></Campo>

      <Campo etiqueta="Condición de pago">
        <Opciones<Condicion> columnas valor={c.condicionPago} onChange={(v) => editable && setC({ ...c, condicionPago: v })} opciones={CONDICIONES.map((v) => ({ valor: v, titulo: LABEL_CONDICION[v] }))} />
      </Campo>
      {c.condicionPago === 'mixta' && (
        <Campo etiqueta="Porcentaje a Cuenta 1" ayuda={`El resto (${100 - (c.porcentajeCuenta1 ?? 0)}%) va a Cuenta 2.`}>
          <Entrada inputMode="numeric" unidad="%" disabled={!editable} value={c.porcentajeCuenta1 ?? ''} onChange={(e) => setC({ ...c, porcentajeCuenta1: Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || null })} />
        </Campo>
      )}
      {puede('ventas', 1) && (nuevo || det) && (
        <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <b>Precio acordado por maple</b>
          <p className="chico tenue">La orden de venta lo trae solo. Vacío = se le cobra el de lista. Sin IVA.</p>
          <div className="precios-cliente">
            {(lista ?? []).filter((v) => v.activo).map((v) => (
              <Campo key={v.id} etiqueta={v.codigo} ayuda={v.precioMaple ? `Lista ${formatPesos(v.precioMaple)}` : 'Sin precio de lista'}>
                <EntradaNumero unidad="$" disabled={!editable} value={valorPrecio(v.id)} onChange={(e) => setPrecios({ ...precios, [v.id]: e.target.value })} placeholder="lista" aria-label={`Precio acordado ${v.codigo}`} />
              </Campo>
            ))}
          </div>
        </div>
      )}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {!nuevo && puede('ventas', 3) && <button className="boton fantasma peligro" onClick={() => setBorrar(true)}>Dar de baja</button>}
        <button className="boton secundario" onClick={onCerrar}>{editable ? 'Cancelar' : 'Cerrar'}</button>
        {editable && <button className="boton primario" onClick={guardar}>{nuevo ? 'Agregar cliente' : 'Guardar cambios'}</button>}
      </div>
      {borrar && (
        <Confirmar titulo={`¿Dar de baja a ${c.nombre}?`} texto="Sí, dar de baja" peligro onSi={async () => { setBorrar(false); await eliminar(); }} onNo={() => setBorrar(false)}>
          <p className="tenue">Deja de aparecer en las listas. Sus ventas y su cuenta corriente quedan guardadas.</p>
        </Confirmar>
      )}
    </Dialogo>
  );
}
