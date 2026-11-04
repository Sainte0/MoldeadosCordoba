import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatPesos } from '@moldeados/shared/base';
import { Plus } from 'lucide-react';
import { api, useSesion, verFecha } from '../api';
import { useClientes, type Cliente } from '../datos';
import { Aviso, Buscador, Cargando, Entrada, Opciones } from '../ui';

/** Paso "¿para quién es?": buscar, tocar, o dar de alta en el momento con el nombre. */
/** `conDeuda`: para cobrar. Muestra cuánto debe cada uno y pone primero a los que deben. */
export function ElegirCliente({ valor, onChange, conDeuda }: { valor: Cliente | null; onChange: (c: Cliente) => void; conDeuda?: boolean }) {
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { puede } = useSesion();
  const { data: lista, isLoading } = useClientes(q);
  const { data: saldos } = useQuery({ queryKey: ['cuentas', 'cliente'], queryFn: () => api<{ id: string; debe: number; haber: number }[]>('/cuentas/cliente'), enabled: !!conDeuda });
  const deuda = new Map((saldos ?? []).map((s) => [s.id, s.debe - s.haber]));
  const debe = (id: string) => deuda.get(id) ?? 0;
  const data = conDeuda && lista ? [...lista].sort((a, b) => debe(b.id) - debe(a.id)) : lista;

  // El cliente nuevo NO se guarda acá: queda pendiente y se crea recién al confirmar el asistente
  // (asegurarCliente). Si se abandona a mitad de camino, no queda un cliente vacío cargado.
  const crear = () => {
    const nombre = nuevo?.trim();
    if (!nombre) return;
    setError(null);
    const existe = lista?.find((x) => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    onChange(existe ?? { id: '', nombre, cuit: null, telefono: null, email: null, direccion: null, vehiculoHabitual: null, notas: null });
    setNuevo(null);
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Buscador placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
      {isLoading ? <Cargando /> : (
        <Opciones
          valor={valor?.id ?? null}
          onChange={(id) => { const c = data?.find((x) => x.id === id); if (c) onChange(c); }}
          opciones={(data ?? []).map((c) => ({ valor: c.id, titulo: c.nombre, detalle: conDeuda && debe(c.id) > 0 ? `Debe ${formatPesos(debe(c.id))}` : conDeuda && debe(c.id) < 0 ? `A favor ${formatPesos(-debe(c.id))}` : conDeuda ? 'Al día' : c.ultimaVenta ? `Última compra: ${verFecha(c.ultimaVenta)}` : 'Cliente nuevo',
            tono: conDeuda ? (debe(c.id) > 0 ? 'critico' as const : 'ok' as const) : undefined }))}
        />
      )}
      {data?.length === 0 && <p className="tenue">{q ? 'No hay clientes con ese nombre.' : 'Todavía no hay clientes cargados.'}</p>}
      {valor && !valor.id && (
        <div className="atencion-item" style={{ gridTemplateColumns: '1fr auto' }}>
          <span><b>{valor.nombre}</b><br /><span className="chico tenue">Cliente nuevo: se guarda al terminar.</span></span>
          <button type="button" className="boton fantasma" onClick={() => setNuevo(valor.nombre)}>Cambiar</button>
        </div>
      )}
      {puede('ventas', 2) && (nuevo === null ? (
        <button type="button" data-guia="nuevo" className="boton secundario" onClick={() => setNuevo(q)}><Plus size={18} aria-hidden /> Es un cliente nuevo</button>
      ) : (
        <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <b>Cliente nuevo</b>
          <Entrada autoFocus placeholder="Nombre o razón social" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }} />
          <p className="chico tenue">El CUIT y los demás datos se completan después en Clientes.</p>
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

/** Al confirmar el asistente: si el cliente es nuevo, se crea ahora. */
export async function asegurarCliente(c: Cliente): Promise<Cliente> {
  if (c.id) return c;
  return api<Cliente>('/clientes', { method: 'POST', body: { nombre: c.nombre } });
}
