import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle, OctagonAlert, TriangleAlert } from 'lucide-react';
import { formatPesos, telefonoWhatsapp, type EstadoRecompra, type Nivel3 } from '@moldeados/shared/base';
import { Estado } from '../Estado';
import { api, useSesion, verFecha } from '../api';
import { useEmpresa } from '../datos';

interface ClienteAviso { id: string; nombre: string; telefono: string | null; ultimoTotal: number; ultimoMaples: number; ultimaCompra: string; compras: number; cadaDias: number | null; diasDesdeUltima: number; estado: EstadoRecompra }
interface AvisoAtencion { nivel: Nivel3; tipo: string; titulo: string; detalle: string; accion: { texto: string; ruta: string } }
interface Avisos { clientes: ClienteAviso[] | null; atencion: AvisoAtencion[] }

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

/** Lo que hay que atender, de lo más urgente (rojo) a lo que puede esperar un poco (ámbar), con su acción. */
export function Atencion() {
  const { data } = useAvisos();
  if (!data?.atencion.length) return null;
  const rojos = data.atencion.filter((a) => a.nivel === 'critico').length;
  return (
    <section aria-labelledby="titulo-atencion" style={{ display: 'grid', gap: 10 }}>
      <h3 id="titulo-atencion">Atención {rojos > 0 && <Estado nivel="critico">{rojos} {rojos === 1 ? 'urgente' : 'urgentes'}</Estado>}</h3>
      <div className="atencion-lista">
        {data.atencion.map((a, i) => {
          const I = a.nivel === 'critico' ? OctagonAlert : TriangleAlert;
          return (
            <div key={i} className={`atencion-item ${a.nivel}`}>
              <I size={22} aria-hidden />
              <div><b>{a.titulo}</b><small>{a.detalle}</small></div>
              <Link to={a.accion.ruta} className="boton secundario">{a.accion.texto}</Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Pedidos por entregar en los próximos días (y los atrasados). */
export function PedidosProximos() {
  const { puede } = useSesion();
  const { data } = useQuery({ queryKey: ['pedidos', 'abierto', ''], queryFn: () => api<{ id: string; numero: number; fechaEntrega: string | null; cliente: string; resumen: string; paquetes: number; despachado: number }[]>('/pedidos?estado=abierto'), enabled: puede('ventas') });
  const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const limite = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  // Los atrasados y los de hoy ya están en Atención: acá, lo que viene.
  const lista = (data ?? []).filter((p) => !p.fechaEntrega || (p.fechaEntrega > hoyStr && p.fechaEntrega <= limite)).slice(0, 6);
  if (!lista.length) return null;
  return (
    <section className="hoja">
      <div className="fila"><div><h3>Próximos pedidos</h3><p className="chico tenue">Los de los próximos 3 días.</p></div><Link to="/pedidos" className="chico">Ver todos</Link></div>
      {lista.map((p) => (
        <Link to={`/pedidos/${p.numero}`} className="fila" key={p.id}>
          <div><div className="principal">{p.cliente}</div><div className="chico tenue">{p.resumen} · {p.despachado} de {p.paquetes} paq. entregados</div></div>
          <span className={`marca-texto ${p.fechaEntrega && p.fechaEntrega < hoyStr ? 'peligro' : p.fechaEntrega === hoyStr ? 'alerta' : ''}`}>{!p.fechaEntrega ? 'Sin fecha' : p.fechaEntrega < hoyStr ? 'Atrasado' : p.fechaEntrega === hoyStr ? 'Hoy' : verFecha(p.fechaEntrega)}</span>
        </Link>
      ))}
    </section>
  );
}
