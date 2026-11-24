import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { LABEL_VEHICULO, VEHICULOS, type Vehiculo } from '@moldeados/shared/base';
import { api, useSesion } from '../api';
import { useChoferes, useClientes, type Chofer } from '../datos';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, Opciones, Confirmar } from '../ui';

// Base de choferes (pedido N° 01): se eligen después en la orden de venta. Un chofer puede cargar para varios clientes.

const VACIO = { nombre: '', apellido: '', dni: '', telefono: '', patente: '', vehiculo: null as Vehiculo | null, clienteIds: [] as string[] };

export function Choferes() {
  const { puede } = useSesion();
  const { data, isLoading } = useChoferes();
  const [editando, setEditando] = useState<Chofer | 'nuevo' | null>(null);
  return (
    <div className="ancho" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Choferes" bajada="Quién retira, con qué vehículo y para qué clientes carga.">
        {puede('ventas', 2) && <button className="boton primario" onClick={() => setEditando('nuevo')}><Plus size={18} aria-hidden /> Nuevo chofer</button>}
      </Cabecera>
      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>Todavía no hay choferes cargados.</p></div> : (
        <div className="hoja filas">
          {data.map((c) => (
            <button key={c.id} className="fila" onClick={() => setEditando(c)}>
              <div>
                <div className="principal">{c.apellido}, {c.nombre}</div>
                <div className="chico tenue">{[c.dni && `DNI ${c.dni}`, c.patente, c.vehiculo && LABEL_VEHICULO[c.vehiculo], c.telefono].filter(Boolean).join(' · ') || 'Sin datos'}</div>
                <div className="chico tenue">{c.clientes.length ? `Carga para ${c.clientes.map((x) => x.nombre).join(', ')}` : 'Sin cliente asignado'}</div>
              </div>
              <ChevronRight size={18} aria-hidden className="tenue" />
            </button>
          ))}
        </div>
      )}
      {editando && <FichaChofer inicial={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function FichaChofer({ inicial, onCerrar }: { inicial: Chofer | null; onCerrar: () => void }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: clientes } = useClientes();
  const [c, setC] = useState(inicial ? {
    nombre: inicial.nombre, apellido: inicial.apellido, dni: inicial.dni ?? '', telefono: inicial.telefono ?? '', patente: inicial.patente ?? '', vehiculo: inicial.vehiculo, clienteIds: inicial.clientes.map((x) => x.id),
  } : VACIO);
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const editable = puede('ventas', 2);
  const texto = (k: 'nombre' | 'apellido' | 'dni' | 'telefono' | 'patente', etiqueta: string, extra: object = {}) => (
    <Campo etiqueta={etiqueta}><Entrada value={c[k]} disabled={!editable} onChange={(e) => setC({ ...c, [k]: e.target.value })} {...extra} /></Campo>
  );
  const listo = async (p: Promise<unknown>) => {
    setError(null);
    try { await p; await qc.invalidateQueries({ queryKey: ['choferes'] }); onCerrar(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  const guardar = () => listo(api(inicial ? `/choferes/${inicial.id}` : '/choferes', { method: inicial ? 'PUT' : 'POST', body: { ...c, dni: c.dni || undefined, telefono: c.telefono || undefined, patente: c.patente || undefined } }));
  const eliminar = () => listo(api(`/choferes/${inicial!.id}`, { method: 'DELETE' }));
  const alternar = (id: string) => setC({ ...c, clienteIds: c.clienteIds.includes(id) ? c.clienteIds.filter((x) => x !== id) : [...c.clienteIds, id] });

  return (
    <Dialogo titulo={inicial ? `${inicial.nombre} ${inicial.apellido}` : 'Nuevo chofer'} onCerrar={onCerrar}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {texto('nombre', 'Nombre', { autoFocus: !inicial })}
        {texto('apellido', 'Apellido')}
        {texto('dni', 'DNI', { inputMode: 'numeric' })}
        {texto('telefono', 'Teléfono', { type: 'tel' })}
      </div>
      {texto('patente', 'Patente', { maxLength: 15, autoCapitalize: 'characters' })}
      <Campo etiqueta="Tipo de vehículo">
        <Opciones<Vehiculo> columnas valor={c.vehiculo} onChange={(v) => editable && setC({ ...c, vehiculo: v })} opciones={VEHICULOS.map((v) => ({ valor: v, titulo: LABEL_VEHICULO[v] }))} />
      </Campo>
      <Campo etiqueta="Carga para" ayuda="Puede ser más de un cliente. En la orden de venta aparece primero con estos.">
        <div className="chips-agregar">
          {(clientes ?? []).map((x) => (
            <button key={x.id} type="button" className="chip" aria-pressed={c.clienteIds.includes(x.id)} disabled={!editable} onClick={() => alternar(x.id)}>{x.nombre}</button>
          ))}
        </div>
      </Campo>
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {inicial && editable && <button className="boton fantasma" onClick={() => setBorrar(true)}>Dar de baja</button>}
        <button className="boton secundario" onClick={onCerrar}>{editable ? 'Cancelar' : 'Cerrar'}</button>
        {editable && <button className="boton primario" onClick={guardar}>{inicial ? 'Guardar cambios' : 'Agregar chofer'}</button>}
      </div>
      {borrar && (
        <Confirmar titulo={`¿Dar de baja a ${`${c.nombre} ${c.apellido}`}?`} texto="Sí, dar de baja" peligro onSi={async () => { setBorrar(false); await eliminar(); }} onNo={() => setBorrar(false)}>
          <p className="tenue">Deja de aparecer al elegir chofer en una orden. Las órdenes viejas lo siguen mostrando.</p>
        </Confirmar>
      )}
    </Dialogo>
  );
}
