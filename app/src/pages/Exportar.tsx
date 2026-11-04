import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileArchive } from 'lucide-react';
import { api, descargar } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { Aviso, Cabecera, Cargando, Entrada } from '../ui';

/** Botón chico para bajar en Excel lo que se está viendo (con el mismo período). */
export function BotonExportar({ que, desde, hasta, texto = 'Exportar a Excel' }: { que: string; desde?: string; hasta?: string; texto?: string }) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bajar = async () => {
    setBajando(true);
    setError(null);
    try {
      await descargar(`/exportar/${que}?desde=${desde ?? ''}&hasta=${hasta ?? ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar');
    } finally {
      setBajando(false);
    }
  };
  return (
    <>
      <button type="button" className="boton secundario" onClick={bajar} disabled={bajando}>
        {que === 'todo' ? <FileArchive size={18} aria-hidden /> : <Download size={18} aria-hidden />} {bajando ? 'Preparando…' : texto}
      </button>
      {error && <Aviso>{error}</Aviso>}
    </>
  );
}

const inicioMes = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()).slice(0, 8) + '01';

/** Ajustes › Exportar datos: cada listado por separado o todo junto en un .zip. */
export function Exportar() {
  const { data, isLoading } = useQuery({ queryKey: ['exportar'], queryFn: () => api<{ id: string; titulo: string; periodo: boolean }[]>('/exportar') });
  const [f, setF] = useFiltros({ desde: inicioMes(), hasta: '' });
  const { desde, hasta } = f;

  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Cabecera titulo="Exportar datos" bajada="Archivos que se abren con Excel o Google Sheets. Los listados con fecha usan el período que elijas." />
      <div className="hoja relleno" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => setF({ desde: e.target.value })} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => setF({ hasta: e.target.value })} /></label>
        </div>
        <p className="chico tenue">Dejá las fechas vacías para bajar todo desde el principio.</p>
        <BotonExportar que="todo" desde={desde} hasta={hasta} texto="Descargar todo (.zip)" />
      </div>
      {isLoading ? <Cargando /> : (
        <div className="hoja filas">
          {data?.map((c) => (
            <div className="fila" key={c.id}>
              <div><div className="principal">{c.titulo}</div><div className="chico tenue">{c.periodo ? 'Del período elegido' : 'Cómo está hoy'}</div></div>
              <BotonExportar que={c.id} desde={c.periodo ? desde : undefined} hasta={c.periodo ? hasta : undefined} texto="Descargar" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
