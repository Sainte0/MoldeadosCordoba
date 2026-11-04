import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { formatPesos, LABEL_TIPO_MP, TIPOS_MP, type TipoMp } from '@moldeados/shared';
import { api, useSesion, verFecha } from '../api';
import { useProveedores, type Proveedor } from '../datos';
import { Aviso, Buscador, Cabecera, Campo, Cargando, Dialogo, Entrada } from '../ui';

const VACIO: Omit<Proveedor, 'id'> = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', tipos: [], notas: '' };

export function Proveedores() {
  const { puede } = useSesion();
  const [q, setQ] = useState('');
  const { data, isLoading } = useProveedores(q);
  const [editando, setEditando] = useState<Partial<Proveedor> | null>(null);

  return (
    <div className="ancho">
      <Cabecera titulo="Proveedores" bajada="Recicladores, supermercados, proveedores de tinta y de aglutinante.">
        {puede('proveedores', 2) && <button className="boton primario" onClick={() => setEditando({ ...VACIO })}><Plus size={18} aria-hidden /> Nuevo proveedor</button>}
      </Cabecera>
      <div style={{ marginBottom: 16 }}><Buscador placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proveedor" /></div>
      {isLoading ? <Cargando /> : !data?.length ? (
        <div className="hoja vacio"><p>{q ? 'Nadie con ese nombre.' : 'Todavía no hay proveedores. Se agregan acá o desde el pesaje.'}</p></div>
      ) : (
        <div className="hoja filas">
          {data.map((p) => (
            <button key={p.id} className="fila" onClick={() => setEditando(p)}>
              <div>
                <div className="principal">{p.nombre}</div>
                <div className="chico tenue">{p.tipos.map((t) => LABEL_TIPO_MP[t]).join(', ') || 'Sin rubro'}{p.ultimaCompra ? ` · última compra ${verFecha(p.ultimaCompra)}` : ''}</div>
              </div>
              <div className="derecha"><div className="cifra">{formatPesos(p.comprado30d ?? 0)}</div><div className="chico tenue">últimos 30 días</div></div>
            </button>
          ))}
        </div>
      )}
      {editando && <FichaProveedor inicial={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

interface Totales { compras: number; total: number; conFactura: number; sinFactura: number }

function FichaProveedor({ inicial, onCerrar }: { inicial: Partial<Proveedor>; onCerrar: () => void }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const [p, setP] = useState({ ...VACIO, ...inicial });
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const nuevo = !inicial.id;
  const editable = nuevo ? puede('proveedores', 2) : puede('proveedores', 3);
  const { data: det } = useQuery({ queryKey: ['proveedor', inicial.id], queryFn: () => api<Proveedor & { totales: Totales }>(`/proveedores/${inicial.id}`), enabled: !nuevo });

  const campo = (k: 'nombre' | 'cuit' | 'telefono' | 'email' | 'direccion', etiqueta: string, extra: object = {}) => (
    <Campo etiqueta={etiqueta}><Entrada value={p[k] ?? ''} disabled={!editable} onChange={(e) => setP({ ...p, [k]: e.target.value })} {...extra} /></Campo>
  );
  const toggle = (t: TipoMp) => setP({ ...p, tipos: p.tipos.includes(t) ? p.tipos.filter((x) => x !== t) : [...p.tipos, t] });

  const guardar = async () => {
    setError(null);
    try {
      const body = { nombre: p.nombre, cuit: p.cuit || undefined, telefono: p.telefono || undefined, email: p.email || undefined, direccion: p.direccion || undefined, tipos: p.tipos, notas: p.notas || undefined };
      await api(nuevo ? '/proveedores' : `/proveedores/${inicial.id}`, { method: nuevo ? 'POST' : 'PUT', body });
      await qc.invalidateQueries({ queryKey: ['proveedores'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };
  const eliminar = async () => {
    try {
      await api(`/proveedores/${inicial.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['proveedores'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar de baja');
    }
  };

  return (
    <Dialogo titulo={nuevo ? 'Nuevo proveedor' : p.nombre} onCerrar={onCerrar}>
      {det && (
        <dl className="resumen hoja relleno">
          <dt>Compras</dt><dd>{det.totales.compras}</dd>
          <dt>Total comprado</dt><dd className="cifra">{formatPesos(det.totales.total)}</dd>
          <dt>Con factura</dt><dd>{formatPesos(det.totales.conFactura)}</dd>
          <dt>Sin factura</dt><dd>{formatPesos(det.totales.sinFactura)}</dd>
        </dl>
      )}
      {!nuevo && <Link className="chico" to={`/compras`}>Ver compras</Link>}
      {campo('nombre', 'Nombre o razón social', { autoFocus: nuevo })}
      <div>
        <span style={{ fontWeight: 600 }}>Qué nos vende</span>
        <div className="opciones dos" style={{ marginTop: 6 }}>
          {TIPOS_MP.map((t) => (
            <button key={t} type="button" className="opcion" aria-pressed={p.tipos.includes(t)} disabled={!editable} onClick={() => toggle(t)} style={{ minHeight: 48 }}>
              <span className="marca-op" aria-hidden /><b>{LABEL_TIPO_MP[t]}</b>
            </button>
          ))}
        </div>
      </div>
      {campo('cuit', 'CUIT', { inputMode: 'numeric', placeholder: '20-12345678-3' })}
      {campo('telefono', 'Teléfono', { type: 'tel' })}
      {campo('email', 'Email', { type: 'email' })}
      {campo('direccion', 'Dirección')}
      <Campo etiqueta="Notas"><textarea className="entrada" value={p.notas ?? ''} disabled={!editable} onChange={(e) => setP({ ...p, notas: e.target.value })} /></Campo>
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {!nuevo && puede('proveedores', 3) && (borrar
          ? <button className="boton peligro" onClick={eliminar}>Confirmar baja</button>
          : <button className="boton fantasma" onClick={() => setBorrar(true)}>Dar de baja</button>)}
        <button className="boton secundario" onClick={onCerrar}>{editable ? 'Cancelar' : 'Cerrar'}</button>
        {editable && <button className="boton primario" onClick={guardar}>{nuevo ? 'Agregar proveedor' : 'Guardar cambios'}</button>}
      </div>
    </Dialogo>
  );
}
