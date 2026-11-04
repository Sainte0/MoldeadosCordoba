import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CornerDownLeft, FileText, Search, Zap } from 'lucide-react';
import { api, useSesion } from './api';
import { useDemorado } from './filtros';
import { GUIAS, normalizar } from './guias';
import { AJUSTES, AREAS, TAREAS } from './navegacion';

interface Item { clave: string; grupo: 'Acciones' | 'Ir a' | 'Datos' | 'Ayuda'; titulo: string; detalle?: string; ruta: string }
interface Dato { tipo: string; id: string; titulo: string; detalle: string; ruta: string }

const ICONO = { Acciones: Zap, 'Ir a': ArrowRight, Datos: FileText, Ayuda: BookOpen } as const;

/**
 * Buscador principal (⌘K / Ctrl+K o el botón con la lupa): secciones, acciones, guías y datos (clientes,
 * proveedores, remitos, tickets, palets, partes) por nombre o número. Solo muestra lo que el rol puede usar.
 */
export function BuscadorGlobal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const navegar = useNavigate();
  const { puede } = useSesion();
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const qDemorado = useDemorado(q.trim(), 200);
  const { data: datos, isFetching } = useQuery({
    queryKey: ['buscar', qDemorado],
    queryFn: () => api<Dato[]>(`/buscar?q=${encodeURIComponent(qDemorado)}`),
    enabled: abierto && (qDemorado.length >= 2 || /^\d+$/.test(qDemorado)),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!abierto) return;
    setQ('');
    setActivo(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [abierto]);

  const items = useMemo<Item[]>(() => {
    const palabras = normalizar(q).split(/\s+/).filter(Boolean);
    const coincide = (t: string) => palabras.every((p) => normalizar(t).includes(p));
    const acciones: Item[] = TAREAS.filter((t) => puede(t.modulo, 2)).map((t) => ({ clave: 'a' + t.a, grupo: 'Acciones', titulo: t.titulo, detalle: t.detalle, ruta: t.a }));
    const secciones: Item[] = [...AREAS, AJUSTES].flatMap((area) => area.pestanas.filter((p) => puede(p.modulo)).map((p) => ({
      clave: 's' + p.a, grupo: 'Ir a' as const, titulo: p.texto === area.texto ? p.texto : `${area.texto} › ${p.texto}`, ruta: p.a,
    })));
    if (!palabras.length) return [...acciones, ...secciones];
    const guias: Item[] = GUIAS.filter((g) => coincide(`${g.titulo} ${g.palabras}`)).slice(0, 4)
      .map((g) => ({ clave: 'g' + g.id, grupo: 'Ayuda', titulo: g.titulo, detalle: 'Guía paso a paso', ruta: `/ayuda?q=${encodeURIComponent(q.trim())}` }));
    const deDatos: Item[] = (datos ?? []).map((d) => ({ clave: 'd' + d.tipo + d.id, grupo: 'Datos', titulo: d.titulo, detalle: `${d.tipo}${d.detalle ? ` · ${d.detalle}` : ''}`, ruta: d.ruta }));
    return [
      ...acciones.filter((a) => coincide(`${a.titulo} ${a.detalle}`)),
      ...secciones.filter((s) => coincide(s.titulo)),
      ...deDatos,
      ...guias,
    ];
  }, [q, datos, puede]);

  useEffect(() => setActivo(0), [q]);
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  if (!abierto) return null;
  const ir = (it: Item | undefined) => { if (!it) return; onCerrar(); navegar(it.ruta); };
  const grupos = items.reduce<Record<string, { it: Item; i: number }[]>>((acc, it, i) => { (acc[it.grupo] ??= []).push({ it, i }); return acc; }, {});

  return (
    <div className="velo velo-buscador" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="buscador-global" role="dialog" aria-modal="true" aria-label="Buscar en el sistema">
        <div className="buscador-global-entrada">
          <Search size={20} aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscá una sección, una acción, un cliente, un n.º de remito…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="buscador-resultados"
            aria-activedescendant={`res-${activo}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(items.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); ir(items[activo]); }
              else if (e.key === 'Escape') onCerrar();
            }}
          />
          <button className="boton fantasma" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="buscador-global-lista" id="buscador-resultados" role="listbox" ref={lista}>
          {Object.entries(grupos).map(([grupo, filas]) => {
            const Icono = ICONO[grupo as Item['grupo']];
            return (
              <div key={grupo}>
                <div className="buscador-grupo">{grupo}</div>
                {filas.map(({ it, i }) => (
                  <button key={it.clave} id={`res-${i}`} data-i={i} role="option" aria-selected={i === activo} className="buscador-item"
                    onMouseEnter={() => setActivo(i)} onClick={() => ir(it)}>
                    <Icono size={18} aria-hidden />
                    <span><b>{it.titulo}</b>{it.detalle && <small>{it.detalle}</small>}</span>
                    {i === activo && <CornerDownLeft size={16} aria-hidden className="buscador-enter" />}
                  </button>
                ))}
              </div>
            );
          })}
          {q.trim() && !items.length && !isFetching && <p className="tenue" style={{ padding: 20 }}>No encontramos "{q}". Probá con el nombre de un cliente, un número de remito o lo que querés hacer.</p>}
          {isFetching && <p className="tenue chico" style={{ padding: '8px 20px' }}>Buscando en los datos…</p>}
        </div>
      </div>
    </div>
  );
}
