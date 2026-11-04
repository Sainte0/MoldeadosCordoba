import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CalendarClock, ClipboardList, X } from 'lucide-react';
import { api, verMomento } from './api';
import { activarPush, estadoPush, type EstadoPush } from './push';
import { Aviso, Dialogo } from './ui';

export interface Notificacion { id: string; tipo: string; titulo: string; detalle: string | null; ruta: string | null; leida: string | null; creada: string }

export const useNotificaciones = (activo = true) => useQuery({
  queryKey: ['notificaciones'],
  queryFn: () => api<{ lista: Notificacion[]; sinLeer: number }>('/notificaciones'),
  enabled: activo,
  refetchInterval: 5 * 60_000, // por si la conexión en vivo estuvo caída
});

export function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return verMomento(iso);
}

const ICONO: Record<string, typeof Bell> = { recordatorio: BellRing, agenda: CalendarClock, pedido: ClipboardList };

/** Botón de la campana con la cantidad sin leer; abre la lista de avisos. */
export function Campana({ alAbrir }: { alAbrir?: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const { data } = useNotificaciones();
  const n = data?.sinLeer ?? 0;
  return (
    <>
      <button className="boton icono campana" onClick={() => { alAbrir?.(); setAbierta(true); }} aria-label={n ? `Avisos: ${n} sin leer` : 'Avisos'}>
        <Bell size={22} aria-hidden />
        {n > 0 && <span className="globito" aria-hidden>{n > 9 ? '9+' : n}</span>}
      </button>
      {abierta && <PanelAvisos onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function PanelAvisos({ onCerrar }: { onCerrar: () => void }) {
  const { data } = useNotificaciones();
  const qc = useQueryClient();
  const ir = useNavigate();
  const leer = async (id?: string) => {
    await api('/notificaciones/leer', { method: 'POST', body: id ? { id } : {} }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ['notificaciones'] });
  };
  const abrir = (x: Notificacion) => {
    if (!x.leida) void leer(x.id);
    onCerrar();
    if (x.ruta) ir(x.ruta);
  };
  const lista = data?.lista ?? [];

  return (
    <Dialogo titulo="Avisos" onCerrar={onCerrar}>
      <button className="boton icono cerrar-dialogo" onClick={onCerrar} aria-label="Cerrar"><X size={22} /></button>
      <ActivarEnTelefono />
      {lista.length === 0 ? <p className="tenue">No tenés avisos. Acá llegan los recordatorios de la agenda y los pedidos nuevos.</p> : (
        <div className="lista-avisos">
          {lista.map((x) => {
            const I = ICONO[x.tipo] ?? Bell;
            return (
              <button key={x.id} className={`aviso-item${x.leida ? '' : ' nuevo'}`} onClick={() => abrir(x)}>
                <I size={20} aria-hidden />
                <span><b>{x.titulo}</b>{x.detalle && <small>{x.detalle}</small>}<small className="tenue">{haceCuanto(x.creada)}</small></span>
                {!x.leida && <span className="punto" aria-label="Sin leer" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="acciones">
        {(data?.sinLeer ?? 0) > 0 && <button className="boton secundario" onClick={() => void leer()}>Marcar todo como leído</button>}
        <button className="boton primario" onClick={() => { onCerrar(); ir('/agenda'); }}><CalendarClock size={18} aria-hidden /> Ver agenda</button>
      </div>
    </Dialogo>
  );
}

/** Ofrece activar los avisos con la app cerrada, según lo que permita este teléfono. */
function ActivarEnTelefono() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activando, setActivando] = useState(false);
  useEffect(() => { void estadoPush().then(setEstado); }, []);

  if (!estado || estado === 'activo' || estado === 'no-soportado') return null;
  if (estado === 'instalar-primero') return <p className="nota-push">Para que los avisos te lleguen con la app cerrada, primero agregá el sistema a la pantalla de inicio (Ayuda › Instalar en el iPhone) y abrilo desde el ícono.</p>;
  if (estado === 'bloqueado') return <p className="nota-push">Los avisos están bloqueados en este teléfono. Se habilitan en Ajustes › Notificaciones › Moldeados.</p>;
  return (
    <div className="nota-push">
      <span>Recibí los avisos en este teléfono aunque la app esté cerrada.</span>
      <button className="boton primario" disabled={activando} onClick={async () => {
        setActivando(true); setError(null);
        try { await activarPush(); setEstado('activo'); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo activar'); } finally { setActivando(false); }
      }}><BellRing size={18} aria-hidden /> {activando ? 'Activando…' : 'Activar avisos'}</button>
      <Aviso>{error}</Aviso>
    </div>
  );
}
