import { useEffect, useState } from 'react';

const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
const dia = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

/**
 * Reloj chico con la hora de Argentina (la misma que usa el sistema para turnos, fechas y cierres), aunque el
 * dispositivo esté configurado en otra zona. Se actualiza al cambiar el minuto, no cada segundo.
 */
export function Reloj({ conFecha }: { conFecha?: boolean }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const programar = () => {
      t = setTimeout(() => { setAhora(new Date()); programar(); }, 60_000 - (Date.now() % 60_000) + 50);
    };
    programar();
    return () => clearTimeout(t);
  }, []);
  return (
    <time className="reloj" dateTime={ahora.toISOString()} title="Hora de Argentina">
      {conFecha && <span>{dia.format(ahora)}</span>}
      <b>{hora.format(ahora)}</b>
    </time>
  );
}
