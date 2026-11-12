import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { aCentavos, formatPesos, LABEL_VEHICULO, VEHICULOS, type Vehiculo } from '@moldeados/shared/base';
import { api, useSesion, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useClientes, useVariantes, type Cliente } from '../datos';
import { Muestra } from '../MapleVista';
import { ParaVender } from './Avisos';
import { Aviso, Buscador, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones } from '../ui';

const VACIO: Omit<Cliente, 'id'> = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', vehiculoHabitual: null, notas: '' };

export function Clientes() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ q: '' });
  const { data, isLoading } = useClientes(useDemorado(f.q));
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null);
  return (
    <div className="ancho">
      <Cabecera titulo="Clientes" bajada="Granjas, distribuidores y todo el que compra maples.">
        {puede('ventas', 2) && <button className="boton primario" onClick={() => setEditando({ ...VACIO })}><Plus size={18} aria-hidden /> Nuevo cliente</button>}
      </Cabecera>
      <div style={{ marginBottom: 20 }}><ParaVender /></div>
      <div style={{ marginBottom: 16 }}><Buscador placeholder="Buscar por nombre" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar cliente" /></div>
      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>{f.q ? 'Nadie con ese nombre.' : 'Todavía no hay clientes. Se agregan acá o al vender.'}</p></div> : (
        <div className="hoja filas">
          {data.map((c) => (
            <button key={c.id} className="fila" onClick={() => setEditando(c)}>
              {/* Todo a la izquierda: con la fecha a la derecha, el nombre quedaba en tres renglones en el iPhone. */}
              <div><div className="principal">{c.nombre}</div><div className="chico tenue">{[c.ultimaVenta ? `Última compra ${verFecha(c.ultimaVenta)}` : 'Sin compras', c.telefono, c.vehiculoHabitual && LABEL_VEHICULO[c.vehiculoHabitual]].filter(Boolean).join(' · ')}</div></div>
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
  const { data: det, refetch } = useQuery({ queryKey: ['cliente', inicial.id], queryFn: () => api<Cliente & { especiales: Especial[] }>(`/clientes/${inicial.id}`), enabled: !nuevo });
  const { data: variantes } = useVariantes();
  const [nuevoPrecio, setNuevoPrecio] = useState<{ varianteId: string | null; precio: string }>({ varianteId: null, precio: '' });

  const campo = (k: 'nombre' | 'cuit' | 'telefono' | 'email' | 'direccion', etiqueta: string, extra: object = {}) => (
    <Campo etiqueta={etiqueta}><Entrada value={c[k] ?? ''} disabled={!editable} onChange={(e) => setC({ ...c, [k]: e.target.value })} {...extra} /></Campo>
  );
  const guardar = async () => {
    setError(null);
    try {
      const body = { nombre: c.nombre, cuit: c.cuit || undefined, telefono: c.telefono || undefined, email: c.email || undefined, direccion: c.direccion || undefined, vehiculoHabitual: c.vehiculoHabitual, notas: c.notas || undefined };
      await api(nuevo ? '/clientes' : `/clientes/${inicial.id}`, { method: nuevo ? 'POST' : 'PUT', body });
      await qc.invalidateQueries({ queryKey: ['clientes'] });
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  const precio = async (varianteId: string, precioMaple: number | null) => {
    setError(null);
    try {
      await api('/precios', { method: 'PUT', body: { varianteId, clienteId: inicial.id, precioMaple } });
      await refetch();
      setNuevoPrecio({ varianteId: null, precio: '' });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el precio'); }
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

      {det && puede('ventas', 1) && (
        <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <b>Precios especiales</b>
          <p className="chico tenue">Si un maple no tiene precio especial, a este cliente se le cobra el de lista.</p>
          {det.especiales.map((e) => (
            <div key={e.varianteId} className="con-muestra" style={{ justifyContent: 'space-between' }}>
              <span className="con-muestra"><Muestra color={e.colorHex} /> {e.codigo}</span>
              <span><b>{formatPesos(e.precioMaple)}</b> <span className="chico tenue">lista {formatPesos(e.precioLista)}</span></span>
              {puede('ventas', 3) && <button className="boton icono" aria-label={`Quitar precio especial de ${e.codigo}`} onClick={() => precio(e.varianteId, null)}><Trash2 size={18} /></button>}
            </div>
          ))}
          {puede('ventas', 3) && (
            <>
              <Opciones columnas valor={nuevoPrecio.varianteId} onChange={(varianteId) => setNuevoPrecio({ ...nuevoPrecio, varianteId })}
                opciones={(variantes ?? []).filter((v) => v.activo && !det.especiales.some((e) => e.varianteId === v.id)).map((v) => ({ valor: v.id, titulo: v.codigo }))} />
              {nuevoPrecio.varianteId && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <EntradaNumero unidad="$/maple" value={nuevoPrecio.precio} onChange={(e) => setNuevoPrecio({ ...nuevoPrecio, precio: e.target.value })} aria-label="Precio especial por maple" />
                  <button className="boton primario" onClick={() => { const p = aCentavos(nuevoPrecio.precio); if (p !== null && p >= 0) void precio(nuevoPrecio.varianteId!, p); }}>Guardar</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {!nuevo && puede('ventas', 3) && (borrar ? <button className="boton peligro" onClick={eliminar}>Confirmar baja</button> : <button className="boton fantasma" onClick={() => setBorrar(true)}>Dar de baja</button>)}
        <button className="boton secundario" onClick={onCerrar}>{editable ? 'Cancelar' : 'Cerrar'}</button>
        {editable && <button className="boton primario" onClick={guardar}>{nuevo ? 'Agregar cliente' : 'Guardar cambios'}</button>}
      </div>
    </Dialogo>
  );
}
