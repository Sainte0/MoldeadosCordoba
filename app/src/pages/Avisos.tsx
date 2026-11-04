import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle, PackageOpen, Wrench } from 'lucide-react';
import { formatCantidad, formatPesos, telefonoWhatsapp, type EstadoRecompra, type Unidad } from '@moldeados/shared/base';
import { api, useSesion, verFecha } from '../api';
import { useEmpresa } from '../datos';

interface ClienteAviso { id: string; nombre: string; telefono: string | null; ultimoTotal: number; ultimoMaples: number; ultimaCompra: string; compras: number; cadaDias: number | null; diasDesdeUltima: number; estado: EstadoRecompra }
interface MateriaAviso { id: string; nombre: string; unidad: Unidad; stock: number; stockMinimo: number; dias: number | null; diasAviso: number }
interface MaquinaAviso { id: string; codigo: string; nombre: string; horasDesdeService: number; serviceCadaHoras: number; servicePasado: boolean }
interface Avisos { clientes: ClienteAviso[] | null; materias: MateriaAviso[] | null; maquinas: MaquinaAviso[] | null }

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

/** Máquinas a las que les toca (o se les pasó) el service según las horas de los partes. */
export function ServiceMaquinas() {
  const { data } = useAvisos();
  if (!data?.maquinas?.length) return null;
  return (
    <section className="hoja">
      <div className="fila"><div><h3>Service de máquinas</h3><p className="chico tenue">Según las horas cargadas en los partes.</p></div></div>
      {data.maquinas.map((m) => (
        <Link to="/maples" className="fila" key={m.id}>
          <span className="con-muestra"><Wrench size={20} aria-hidden style={{ color: m.servicePasado ? 'var(--peligro)' : 'var(--alerta)' }} />
            <span><span className="principal">{m.codigo}</span><br /><span className="chico tenue">{m.horasDesdeService} h de {m.serviceCadaHoras} h</span></span></span>
          <span className={`marca-texto ${m.servicePasado ? 'peligro' : 'alerta'}`}>{m.servicePasado ? 'Vencido' : 'Le toca'}</span>
        </Link>
      ))}
    </section>
  );
}

/** Pedidos por entregar en los próximos días (y los atrasados). */
export function PedidosProximos() {
  const { puede } = useSesion();
  const { data } = useQuery({ queryKey: ['pedidos', 'abierto', ''], queryFn: () => api<{ id: string; numero: number; fechaEntrega: string | null; cliente: string; resumen: string; paquetes: number; despachado: number }[]>('/pedidos?estado=abierto'), enabled: puede('ventas') });
  const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const limite = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const lista = (data ?? []).filter((p) => !p.fechaEntrega || p.fechaEntrega <= limite).slice(0, 6);
  if (!lista.length) return null;
  return (
    <section className="hoja">
      <div className="fila"><div><h3>Pedidos para entregar</h3><p className="chico tenue">Atrasados y de los próximos 3 días.</p></div><Link to="/pedidos" className="chico">Ver todos</Link></div>
      {lista.map((p) => (
        <Link to={`/pedidos/${p.id}`} className="fila" key={p.id}>
          <div><div className="principal">{p.cliente}</div><div className="chico tenue">{p.resumen} · {p.despachado} de {p.paquetes} paq. entregados</div></div>
          <span className={`marca-texto ${p.fechaEntrega && p.fechaEntrega < hoyStr ? 'peligro' : p.fechaEntrega === hoyStr ? 'alerta' : ''}`}>{!p.fechaEntrega ? 'Sin fecha' : p.fechaEntrega < hoyStr ? 'Atrasado' : p.fechaEntrega === hoyStr ? 'Hoy' : verFecha(p.fechaEntrega)}</span>
        </Link>
      ))}
    </section>
  );
}
