import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, FileDown, Pencil, PlayCircle, Plus, Printer } from 'lucide-react';
import { api, useSesion, verMomento } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useEmpresa } from '../datos';
import { GUIAS, normalizar, type Guia } from '../guias';
import { hayRecorrido, iniciarRecorrido } from '../Recorrido';
import { Aviso, Buscador, Cabecera, Campo, Dialogo, Entrada } from '../ui';

interface Procedimiento { id: string; titulo: string; resumen: string | null; pasos: string; actualizado: string }
type Imprimir = { guias: Guia[]; procedimientos: Procedimiento[]; titulo: string } | null;

const AREAS = ['Primeros pasos', 'Planta', 'Ventas', 'Compras', 'Plata', 'Tablero', 'Ajustes'] as const;
const pasosDe = (p: Procedimiento) => p.pasos.split('\n').map((s) => s.trim()).filter(Boolean);
const aplica = (g: Guia, path: string) => g.pantallas.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(p.endsWith('/') ? p : p + '/') || path.startsWith(p + '?')));

/** Centro de ayuda: guías del sistema y procedimientos de la planta, con buscador y descarga en PDF. */
export function Ayuda() {
  const [params] = useSearchParams();
  const desde = params.get('desde') ?? '';
  const { puede } = useSesion();
  const { data: procs } = useQuery({ queryKey: ['procedimientos'], queryFn: () => api<Procedimiento[]>('/procedimientos') });
  const [f, setF] = useFiltros({ q: '', desde: '' });
  const q = f.q;
  const [editando, setEditando] = useState<Partial<Procedimiento> | null>(null);
  const [imprimir, setImprimir] = useState<Imprimir>(null);
  const editaProcs = puede('usuarios', 3) || puede('produccion', 3);

  useEffect(() => {
    if (!imprimir) return;
    const fin = () => setImprimir(null);
    window.addEventListener('afterprint', fin, { once: true });
    const t = setTimeout(() => window.print(), 50); // que se dibuje antes de abrir el diálogo
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fin); };
  }, [imprimir]);

  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const coincide = (texto: string) => palabras.every((p) => normalizar(texto).includes(p));
  const guias = useMemo(() => (palabras.length
    ? GUIAS.filter((g) => coincide(`${g.titulo} ${g.palabras} ${g.area} ${g.pasos.join(' ')}`))
      .sort((a, b) => Number(coincide(b.titulo)) - Number(coincide(a.titulo)))
    : GUIAS), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const procsFiltrados = (procs ?? []).filter((p) => !palabras.length || coincide(`${p.titulo} ${p.resumen ?? ''} ${p.pasos}`));
  const deEstaPantalla = desde ? GUIAS.filter((g) => aplica(g, desde) && g.id !== 'instructivos' && (desde === '/' || g.pantallas[0] !== '/')) : [];

  return (
    <div className="columna" style={{ display: 'grid', gap: 16 }}>
      <div className="ayuda-pantalla" style={{ display: 'grid', gap: 16 }}>
        <Cabecera titulo="Ayuda" bajada="Cómo hacer cada cosa en el sistema, y los procedimientos de la planta.">
          <button className="boton secundario" onClick={() => setImprimir({ guias: GUIAS, procedimientos: procs ?? [], titulo: 'Manual de uso' })}>
            <FileDown size={18} aria-hidden /> Manual completo (PDF)
          </button>
        </Cabecera>
        <Buscador placeholder="¿Qué querés hacer? Ej.: anular una venta, cheque, etiqueta" value={q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar en la ayuda" autoFocus={!desde} />

        {!palabras.length && deEstaPantalla.length > 0 && (
          <section style={{ display: 'grid', gap: 10 }}>
            <h3>En la pantalla donde estabas</h3>
            {deEstaPantalla.map((g) => <TarjetaGuia key={g.id} g={g} abierta onImprimir={() => setImprimir({ guias: [g], procedimientos: [], titulo: g.titulo })} />)}
          </section>
        )}

        {palabras.length > 0 && !guias.length && !procsFiltrados.length && (
          <div className="hoja vacio"><p>No encontramos nada con "{q}". Probá con otra palabra, por ejemplo "venta", "palet" o "cheque".</p></div>
        )}

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3>Procedimientos de la planta</h3>
            {editaProcs && <button className="boton secundario" onClick={() => setEditando({ pasos: '' })}><Plus size={18} aria-hidden /> Nuevo procedimiento</button>}
          </div>
          {procsFiltrados.map((p) => (
            <details key={p.id} className="hoja guia" open={palabras.length > 0}>
              <summary><BookOpen size={18} aria-hidden /> <span>{p.titulo}</span></summary>
              <div className="guia-cuerpo">
                {p.resumen && <p className="tenue">{p.resumen}</p>}
                <ol>{pasosDe(p).map((s, i) => <li key={i}>{s}</li>)}</ol>
                <p className="chico tenue">Actualizado {verMomento(p.actualizado)}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="boton secundario" onClick={() => setImprimir({ guias: [], procedimientos: [p], titulo: p.titulo })}><Printer size={18} aria-hidden /> Imprimir o guardar PDF</button>
                  {editaProcs && <button className="boton fantasma" onClick={() => setEditando(p)}><Pencil size={16} aria-hidden /> Editar</button>}
                </div>
              </div>
            </details>
          ))}
          {!procsFiltrados.length && !palabras.length && <p className="tenue">Todavía no hay procedimientos cargados.</p>}
        </section>

        {(palabras.length ? [null] : AREAS).map((area) => {
          const lista = area ? guias.filter((g) => g.area === area) : guias;
          if (!lista.length) return null;
          return (
            <section key={area ?? 'resultados'} style={{ display: 'grid', gap: 10 }}>
              <h3>{area ? `Sistema: ${area.toLowerCase()}` : 'Cómo se hace en el sistema'}</h3>
              {lista.map((g) => <TarjetaGuia key={g.id} g={g} abierta={palabras.length > 0 && lista.length <= 3} onImprimir={() => setImprimir({ guias: [g], procedimientos: [], titulo: g.titulo })} />)}
            </section>
          );
        })}
      </div>

      {imprimir && <Impresion {...imprimir} />}
      {editando && <EditarProcedimiento inicial={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function TarjetaGuia({ g, abierta, onImprimir }: { g: Guia; abierta?: boolean; onImprimir: () => void }) {
  const ir = useNavigate();
  const pantalla = g.pantallas.find((p) => p !== '/' && !p.endsWith('/'));
  return (
    <details className="hoja guia" open={abierta}>
      <summary><span>{g.titulo}</span>{hayRecorrido(g.id) && <span className="marca-texto">Interactiva</span>}</summary>
      <div className="guia-cuerpo">
        <ol>{g.pasos.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hayRecorrido(g.id) && <button className="boton primario" onClick={() => iniciarRecorrido(g.id, g.titulo)}><PlayCircle size={18} aria-hidden /> Mostrame cómo</button>}
          {pantalla && <button className="boton secundario" onClick={() => ir(pantalla)}><ArrowRight size={16} aria-hidden /> Ir a la pantalla</button>}
          <button className="boton fantasma" onClick={onImprimir}><Printer size={16} aria-hidden /> Imprimir o guardar PDF</button>
        </div>
      </div>
    </details>
  );
}

/** Lo que sale al imprimir (o "Guardar como PDF"): solo el contenido, con el nombre de la empresa. */
function Impresion({ guias, procedimientos, titulo }: NonNullable<Imprimir>) {
  const { data: empresa } = useEmpresa();
  return (
    <article className="impresion">
      <style>{'@media print { @page { size: A4; margin: 16mm 14mm; } }'}</style>
      <header>
        <img src="/logo.webp" width={40} height={40} alt="" />
        <div><b>{empresa?.razonSocial ?? 'Moldeados Córdoba'}</b><div>{titulo}</div></div>
      </header>
      {procedimientos.map((p) => (
        <section key={p.id}>
          <h2>{p.titulo}</h2>
          {p.resumen && <p>{p.resumen}</p>}
          <ol>{pasosDe(p).map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      ))}
      {guias.map((g) => (
        <section key={g.id}>
          <h2>{g.titulo}</h2>
          <ol>{g.pasos.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      ))}
    </article>
  );
}

function EditarProcedimiento({ inicial, onCerrar }: { inicial: Partial<Procedimiento>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState(inicial.titulo ?? '');
  const [resumen, setResumen] = useState(inicial.resumen ?? '');
  const [pasos, setPasos] = useState(inicial.pasos ?? '');
  const [borrar, setBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    setError(null);
    try {
      await api(inicial.id ? `/procedimientos/${inicial.id}` : '/procedimientos', { method: inicial.id ? 'PUT' : 'POST', body: { titulo, resumen: resumen || undefined, pasos } });
      await qc.invalidateQueries({ queryKey: ['procedimientos'] });
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  const eliminar = async () => {
    try {
      await api(`/procedimientos/${inicial.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['procedimientos'] });
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar'); }
  };
  return (
    <Dialogo titulo={inicial.id ? 'Editar procedimiento' : 'Nuevo procedimiento'} onCerrar={onCerrar}>
      <Campo etiqueta="Título"><Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Limpieza del pulper" autoFocus={!inicial.id} /></Campo>
      <Campo etiqueta="De qué se trata" ayuda="Opcional, una o dos frases."><Entrada value={resumen} onChange={(e) => setResumen(e.target.value)} /></Campo>
      <Campo etiqueta="Pasos" ayuda="Un paso por renglón. Se numeran solos.">
        <textarea className="entrada" style={{ minHeight: 260 }} value={pasos} onChange={(e) => setPasos(e.target.value)} />
      </Campo>
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {inicial.id && (borrar ? <button className="boton peligro" onClick={eliminar}>Confirmar borrado</button> : <button className="boton fantasma" onClick={() => setBorrar(true)}>Borrar</button>)}
        <button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>Guardar</button>
      </div>
    </Dialogo>
  );
}
