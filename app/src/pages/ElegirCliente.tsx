import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, useSesion, verFecha } from '../api';
import { useClientes, type Cliente } from '../datos';
import { Aviso, Buscador, Cargando, Entrada, Opciones } from '../ui';

/** Paso "¿para quién es?": buscar, tocar, o dar de alta en el momento con el nombre. */
export function ElegirCliente({ valor, onChange }: { valor: Cliente | null; onChange: (c: Cliente) => void }) {
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data, isLoading } = useClientes(q);

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
          opciones={(data ?? []).map((c) => ({ valor: c.id, titulo: c.nombre, detalle: c.ultimaVenta ? `Última compra: ${verFecha(c.ultimaVenta)}` : 'Cliente nuevo' }))}
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
