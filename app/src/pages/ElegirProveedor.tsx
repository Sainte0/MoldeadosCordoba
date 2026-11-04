import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { TipoMp } from '@moldeados/shared/base';
import { api, useSesion, verFecha } from '../api';
import { useProveedores, type Proveedor } from '../datos';
import { Aviso, Buscador, Cargando, Entrada, Opciones } from '../ui';

/** Paso "¿a quién le compraste?": buscar, tocar, o dar de alta en el momento solo con el nombre. */
export function ElegirProveedor({ tipo, valor, onChange }: { tipo?: TipoMp; valor: Proveedor | null; onChange: (p: Proveedor) => void }) {
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { puede } = useSesion();
  // Sin búsqueda: los que venden este tipo. Buscando: todos.
  const { data, isLoading } = useProveedores(q, q || !tipo ? '' : tipo);

  // El proveedor nuevo NO se guarda acá: queda pendiente y se crea recién al confirmar el asistente
  // (asegurarProveedor). Si se abandona a mitad de camino, no queda un proveedor vacío cargado.
  const crear = () => {
    const nombre = nuevo?.trim();
    if (!nombre) return;
    setError(null);
    const existe = data?.find((x) => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    onChange(existe ?? { id: '', nombre, cuit: null, telefono: null, email: null, direccion: null, tipos: tipo ? [tipo] : [], notas: null });
    setNuevo(null);
  };

  return (
    <div className="paso-cuerpo" style={{ animation: 'none' }}>
      <Buscador placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proveedor" />
      {isLoading ? <Cargando /> : (
        <Opciones
          valor={valor?.id ?? null}
          onChange={(id) => { const p = data?.find((x) => x.id === id); if (p) onChange(p); }}
          opciones={(data ?? []).map((p) => ({ valor: p.id, titulo: p.nombre, detalle: p.ultimaCompra ? `Última compra: ${verFecha(p.ultimaCompra)}` : 'Sin compras todavía' }))}
        />
      )}
      {data?.length === 0 && <p className="tenue">{q ? 'No hay proveedores con ese nombre.' : 'Todavía no hay proveedores cargados.'}</p>}
      {valor && !valor.id && (
        <div className="atencion-item" style={{ gridTemplateColumns: '1fr auto' }}>
          <span><b>{valor.nombre}</b><br /><span className="chico tenue">Proveedor nuevo: se guarda al terminar.</span></span>
          <button type="button" className="boton fantasma" onClick={() => setNuevo(valor.nombre)}>Cambiar</button>
        </div>
      )}
      {puede('proveedores', 2) && (nuevo === null ? (
        <button type="button" className="boton secundario" onClick={() => setNuevo(q)}><Plus size={18} aria-hidden /> Es un proveedor nuevo</button>
      ) : (
        <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <b>Proveedor nuevo</b>
          <Entrada autoFocus placeholder="Nombre o razón social" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }} />
          <p className="chico tenue">El CUIT y los demás datos los podés completar después en Proveedores.</p>
          <Aviso>{error}</Aviso>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="boton primario" data-elige onClick={crear}>Elegir</button>
            <button type="button" className="boton fantasma" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Al confirmar el asistente: si el proveedor es nuevo, se crea ahora. */
export async function asegurarProveedor(p: Proveedor): Promise<Proveedor> {
  if (p.id) return p;
  return api<Proveedor>('/proveedores', { method: 'POST', body: { nombre: p.nombre, tipos: p.tipos } });
}
