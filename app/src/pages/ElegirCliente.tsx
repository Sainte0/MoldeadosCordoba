import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const qc = useQueryClient();
  const { data: lista, isLoading } = useClientes(q);
  const { data: saldos } = useQuery({ queryKey: ['cuentas', 'cliente'], queryFn: () => api<{ id: string; debe: number; haber: number }[]>('/cuentas/cliente'), enabled: !!conDeuda });
  const deuda = new Map((saldos ?? []).map((s) => [s.id, s.debe - s.haber]));
  const debe = (id: string) => deuda.get(id) ?? 0;
  const data = conDeuda && lista ? [...lista].sort((a, b) => debe(b.id) - debe(a.id)) : lista;

  const crear = async () => {
    if (!nuevo?.trim()) return;
    setError(null);
    try {
      const c = await api<Cliente>('/clientes', { method: 'POST', body: { nombre: nuevo } });
      await qc.invalidateQueries({ queryKey: ['clientes'] });
      onChange(c);
      setNuevo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Buscador placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
      {isLoading ? <Cargando /> : (
        <Opciones
          valor={valor?.id ?? null}
          onChange={(id) => { const c = data?.find((x) => x.id === id); if (c) onChange(c); }}
          opciones={(data ?? []).map((c) => ({ valor: c.id, titulo: c.nombre, detalle: conDeuda && debe(c.id) > 0 ? `Debe ${formatPesos(debe(c.id))}` : conDeuda && debe(c.id) < 0 ? `A favor ${formatPesos(-debe(c.id))}` : conDeuda ? 'Al día' : c.ultimaVenta ? `Última compra: ${verFecha(c.ultimaVenta)}` : 'Cliente nuevo' }))}
        />
      )}
      {data?.length === 0 && <p className="tenue">{q ? 'No hay clientes con ese nombre.' : 'Todavía no hay clientes cargados.'}</p>}
      {puede('ventas', 2) && (nuevo === null ? (
        <button type="button" className="boton secundario" onClick={() => setNuevo(q)}><Plus size={18} aria-hidden /> Es un cliente nuevo</button>
      ) : (
        <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <b>Cliente nuevo</b>
          <Entrada autoFocus placeholder="Nombre o razón social" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }} />
          <p className="chico tenue">El CUIT y los demás datos se completan después en Clientes.</p>
          <Aviso>{error}</Aviso>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="boton primario" onClick={crear}>Agregar y elegir</button>
            <button type="button" className="boton fantasma" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
