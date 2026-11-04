import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle, PackageOpen } from 'lucide-react';
import { formatCantidad, formatPesos, telefonoWhatsapp, type EstadoRecompra, type Unidad } from '@moldeados/shared/base';
import { api, useSesion, verFecha } from '../api';
import { useEmpresa } from '../datos';

interface ClienteAviso { id: string; nombre: string; telefono: string | null; ultimoTotal: number; ultimoMaples: number; ultimaCompra: string; compras: number; cadaDias: number | null; diasDesdeUltima: number; estado: EstadoRecompra }
interface MateriaAviso { id: string; nombre: string; unidad: Unidad; stock: number; stockMinimo: number; dias: number | null; diasAviso: number }
interface Avisos { clientes: ClienteAviso[] | null; materias: MateriaAviso[] | null }

export const useAvisos = () => useQuery({ queryKey: ['avisos'], queryFn: () => api<Avisos>('/avisos'), staleTime: 60_000 });

function mensaje(c: ClienteAviso, empresa: string): string {
  // Sin nombre de pila: los clientes suelen ser empresas ("Hola Avícola" queda mal).
  return c.estado === 'le_toca'
    ? `Hola, ¿cómo andan? Les escribimos de ${empresa}. ¿Les preparamos maples para esta semana?`
    : `Hola, ¿cómo andan? Les escribimos de ${empresa}. Hace un tiempo que no nos compran: ¿necesitan maples? Tenemos stock para entregar.`;
}

/** Clientes para llamar: a los que les toca comprar y los que dejaron. WhatsApp con el mensaje armado. */
export function ParaVender({ limite }: { limite?: number }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data } = useAvisos();
  const { data: empresa } = useEmpresa();
  const lista = data?.clientes ?? [];
  if (!data?.clientes || !lista.length) return null;
  const visibles = limite ? lista.slice(0, limite) : lista;

  const contactado = async (id: string) => {
    await api(`/clientes/${id}/contactado`, { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ['avisos'] });
  };

  return (
    <section className="hoja">
      <div className="fila">
        <div><h3>Para vender</h3><p className="chico tenue">Según cada cuánto compra cada cliente.</p></div>
        {limite && lista.length > limite && <Link to="/clientes" className="chico">Ver los {lista.length}</Link>}
      </div>
      {visibles.map((c) => {
        const wa = telefonoWhatsapp(c.telefono);
        return (
          <div className="fila aviso-cliente" key={c.id}>
            <div>
              <div className="principal">{c.nombre} <span className={`marca-texto ${c.estado === 'le_toca' ? 'ok' : 'alerta'}`}>{c.estado === 'le_toca' ? 'Le toca comprar' : 'Dejó de comprar'}</span></div>
              <div className="chico tenue">
                {c.cadaDias ? `Compra cada ${c.cadaDias} días · ` : 'Compró una vez · '}
                última hace {c.diasDesdeUltima} días ({verFecha(c.ultimaCompra)}): {c.ultimoMaples ? `${c.ultimoMaples.toLocaleString('es-AR')} maples, ` : ''}{formatPesos(c.ultimoTotal)}
              </div>
            </div>
            <div className="acciones-aviso">
              {wa
                ? <a className="boton primario" href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje(c, empresa?.razonSocial ?? 'Moldeados Córdoba'))}`} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden /> WhatsApp</a>
                : <Link className="boton secundario" to="/clientes">Cargar teléfono</Link>}
              {puede('ventas', 2) && <button className="boton icono" title="Ya lo contacté (se oculta una semana)" aria-label={`Ya contacté a ${c.nombre}`} onClick={() => contactado(c.id)}><Check size={20} /></button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Materia prima que se acaba pronto según lo que se viene usando. */
export function PorAcabarse() {
  const { puede } = useSesion();
  const { data } = useAvisos();
  if (!data?.materias?.length) return null;
  return (
    <section className="hoja">
      <div className="fila"><div><h3>Hay que comprar</h3><p className="chico tenue">Según lo que se usó en los últimos 30 días.</p></div></div>
      {data.materias.map((m) => (
        <div className="fila" key={m.id}>
          <div className="con-muestra">
            <PackageOpen size={20} aria-hidden style={{ color: 'var(--kraft)' }} />
            <div>
              <div className="principal">{m.nombre}</div>
              <div className="chico tenue">Quedan {formatCantidad(m.stock, m.unidad)}{m.dias !== null ? ` · alcanza para ${m.dias === 0 ? 'menos de un día' : `${m.dias} días`}` : ' · debajo del mínimo'}</div>
            </div>
          </div>
          {puede('compras', 2) && <Link to={m.dias !== null && m.nombre.toLowerCase().includes('cart') ? '/pesaje' : '/compras/nueva'} className="boton secundario">Cargar compra</Link>}
        </div>
      ))}
    </section>
  );
}
