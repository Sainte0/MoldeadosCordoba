import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LABEL_VEHICULO, PALET_DEFAULT, VEHICULOS, type Vehiculo } from '@moldeados/shared/base';
import { api } from '../api';
import { useStockMaples } from '../datos';
import { Muestra } from '../MapleVista';
import { Asistente, Campo, Entrada, Opciones, type Paso } from '../ui';

// ponytail: altura sugerida por vehículo; el operario la cambia si el cliente lo pide distinto.
const ALTO_SUGERIDO: Record<Vehiculo, number> = { camioneta: 4, chasis: 6, acoplado: 8, camion_termico: 6 };

function Contador({ etiqueta, valor, set, max }: { etiqueta: string; valor: number; set: (n: number) => void; max: number }) {
  return (
    <Campo etiqueta={etiqueta}>
      <div className="contador">
        <button type="button" onClick={() => set(Math.max(1, valor - 1))} aria-label={`Menos ${etiqueta.toLowerCase()}`}>−</button>
        <span className="cifra" aria-live="polite">{valor}</span>
        <button type="button" onClick={() => set(Math.min(max, valor + 1))} aria-label={`Más ${etiqueta.toLowerCase()}`}>+</button>
      </div>
    </Campo>
  );
}

/** Armar palet: se eligen maple y armado; el sistema toma los paquetes de los partes más viejos y genera la etiqueta. */
export function NuevoPalet() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: stock } = useStockMaples();
  const [varianteId, setVarianteId] = useState<string | null>(null);
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [ancho, setAncho] = useState<number>(PALET_DEFAULT.ancho);
  const [largo, setLargo] = useState<number>(PALET_DEFAULT.largo);
  const [alto, setAlto] = useState<number>(PALET_DEFAULT.alto);
  const [destino, setDestino] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = stock?.find((x) => x.id === varianteId);
  const sueltos = s ? s.producido - s.enPalets : 0;
  const paquetes = ancho * largo * alto;
  const lectura = s && (
    <div className="lectura">
      <span>{paquetes} paquetes · {(paquetes * s.maplesPorPaquete).toLocaleString('es-AR')} maples</span>
      <span className="cifra" style={{ fontSize: '1.4rem', color: paquetes > sueltos ? '#ff8a7a' : undefined }}>{sueltos.toLocaleString('es-AR')} sueltos</span>
    </div>
  );

  const pasos: Paso[] = [
    {
      titulo: '¿Qué maple va en el palet?',
      ayuda: 'Un palet lleva un solo código de maple. Al lado de cada uno ves cuántos paquetes hay producidos sin paletizar.',
      contenido: (
        <div className="opciones">
          {stock?.filter((x) => x.activo || x.producido - x.enPalets > 0).sort((a, b) => (b.producido - b.enPalets) - (a.producido - a.enPalets)).map((x) => (
            <button type="button" key={x.id} className="opcion" aria-pressed={x.id === varianteId} onClick={() => setVarianteId(x.id)}>
              <Muestra color={x.colorHex} grande />
              <span style={{ flex: 1 }}><b>{x.codigo}</b><small>{x.nombre}</small></span>
              {x.producido - x.enPalets > 0
                ? <span className="derecha"><span className="cifra">{(x.producido - x.enPalets).toLocaleString('es-AR')}</span><br /><small>sin paletizar</small></span>
                : <small>Nada sin paletizar</small>}
            </button>
          ))}
        </div>
      ),
      listo: !varianteId ? 'Elegí el maple' : sueltos <= 0 ? 'No hay paquetes sueltos de este maple: primero cargá el parte de producción' : true,
      rapido: true,
    },
    {
      titulo: '¿Cómo se arma?',
      ayuda: 'Elegí en qué lo buscan: te sugerimos la altura. Después ajustá ancho, largo y alto en paquetes si el cliente lo pide distinto.',
      contenido: (
        <>
          <Opciones columnas valor={vehiculo} onChange={(v) => { setVehiculo(v); setAlto(ALTO_SUGERIDO[v]); }} opciones={VEHICULOS.map((v) => ({ valor: v, titulo: LABEL_VEHICULO[v], detalle: `${ALTO_SUGERIDO[v]} de alto` }))} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Contador etiqueta="Ancho" valor={ancho} set={setAncho} max={10} />
            <Contador etiqueta="Largo" valor={largo} set={setLargo} max={10} />
            <Contador etiqueta="Alto" valor={alto} set={setAlto} max={20} />
          </div>
          {lectura}
        </>
      ),
      listo: paquetes > sueltos ? `Hay ${sueltos.toLocaleString('es-AR')} paquetes sueltos y este armado lleva ${paquetes}. Bajá la altura o cargá el parte que falta.` : true,
    },
    {
      titulo: '¿Para quién es?',
      ayuda: 'Opcional. Anotá el cliente o el destino para que quede en la etiqueta.',
      contenido: (
        <>
          <Campo etiqueta="Cliente o destino"><Entrada value={destino} onChange={(e) => setDestino(e.target.value)} autoFocus /></Campo>
          <Campo etiqueta="Observaciones"><textarea className="entrada" value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        </>
      ),
      listo: true,
    },
    {
      titulo: 'Revisá y armá',
      ayuda: 'Al guardar se toman los paquetes de los partes más viejos y se genera la etiqueta con el QR para pegar en el palet.',
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>Maple</dt><dd className="con-muestra"><Muestra color={s?.colorHex ?? null} /> {s?.codigo}</dd>
            <dt>Armado</dt><dd>{ancho} × {largo} × {alto}{vehiculo ? ` · ${LABEL_VEHICULO[vehiculo]}` : ''}</dd>
            {destino && <><dt>Para</dt><dd>{destino}</dd></>}
          </dl>
          {lectura}
        </>
      ),
      listo: true,
    },
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await api<{ id: string }>('/palets', { method: 'POST', body: { varianteId, ancho, largo, alto, vehiculo, destino: destino || undefined, notas: notas || undefined } });
      await qc.invalidateQueries();
      navegar(`/palets/${r.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar');
      setGuardando(false);
    }
  };

  return <Asistente proceso="palet" pasos={pasos} onTerminar={guardar} textoTerminar="Armar palet" guardando={guardando} error={error} onCancelar={() => navegar('/palets')} />;
}
