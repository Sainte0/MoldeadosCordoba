import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { List, ScanLine, Trash2 } from 'lucide-react';
import { aCentavos, calcularVenta, formatIva, formatPesos, LABEL_VEHICULO, VEHICULOS, type Vehiculo } from '@moldeados/shared/base';
import { api, hoy, nroTicket, useSesion, verFecha } from '../api';
import { useStockMaples, type Cliente, type PaletDisponible } from '../datos';
import type { PedidoDetalle } from './Pedidos';
import { enviarOGuardar } from '../cola';
import { Escaner, idDePalet } from '../Escaner';
import { Firma } from '../Firma';
import { Muestra } from '../MapleVista';
import { Asistente, Aviso, Campo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';
import { ElegirCliente } from './ElegirCliente';
import { PasoFactura, facturaBody, facturaLista, type DatosFactura } from './Factura';

const aTexto = (c: number) => (c ? String(c / 100).replace('.', ',') : '');

/**
 * Despacho = venta. Se escanean los palets que suben al camión, se dice para quién son, quién se los lleva y
 * cómo, y quedan vendidos. Pensado para el iPhone/iPad en el playón.
 */
export function Despacho() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const cambiaPrecios = puede('ventas', 3);
  const { data: disponibles, refetch } = useQuery({ queryKey: ['palets-disponibles'], queryFn: () => api<PaletDisponible[]>('/palets-disponibles') });

  const [elegidos, setElegidos] = useState<string[]>(() => (params.get('palet') ? [params.get('palet')!] : []));
  const [modo, setModo] = useState<'camara' | 'lista'>('camara');
  const [lectura, setLectura] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [retira, setRetira] = useState('');
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [patente, setPatente] = useState('');
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [factura, setFactura] = useState<DatosFactura>({ conFactura: null, nroFactura: '', ivaBp: 0 });
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState('');
  const [sueltos, setSueltos] = useState<{ varianteId: string; paquetes: number }[]>([]);
  const [formSuelto, setFormSuelto] = useState<{ varianteId: string | null; cantidad: string } | null>(null);
  const [pedidoId, setPedidoId] = useState<string | null>(params.get('pedido'));
  const [firma, setFirma] = useState<string | null>(null);
  const { data: stock } = useStockMaples();
  const { data: pedido } = useQuery({ queryKey: ['pedido', pedidoId], queryFn: () => api<PedidoDetalle>(`/pedidos/${pedidoId}`), enabled: !!pedidoId });
  const { data: pedidosCliente } = useQuery({ queryKey: ['pedidos', 'abierto', cliente?.id], queryFn: () => api<{ id: string; numero: number; fechaEntrega: string | null; resumen: string }[]>(`/pedidos?estado=abierto&clienteId=${cliente!.id}`), enabled: !!cliente && !params.get('pedido') });
  // Entrando desde un pedido: el cliente ya está elegido.
  useEffect(() => {
    if (pedido && !cliente) api<Cliente>(`/clientes/${pedido.clienteId}`).then(setCliente).catch(() => {});
  }, [pedido]); // eslint-disable-line react-hooks/exhaustive-deps
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palets = (disponibles ?? []).filter((p) => elegidos.includes(p.id));
  // Todo lo que sube al camión: palets escaneados y paquetes sueltos, con la misma forma.
  const lineas = [
    ...palets.map((p) => ({ clave: p.id, varianteId: p.varianteId, codigo: p.codigo, colorHex: p.colorHex, paquetes: p.paquetes, maplesPorPaquete: p.maplesPorPaquete,
      titulo: `Palet ${nroTicket(p.numero)} · ${p.codigo}`, detalle: `${p.paquetes} paquetes (${p.ancho}×${p.largo}×${p.alto})`, quitar: () => setElegidos((e) => e.filter((x) => x !== p.id)) })),
    ...sueltos.map((s, i) => {
      const v = stock?.find((x) => x.id === s.varianteId);
      return { clave: `s${i}`, varianteId: s.varianteId, codigo: v?.codigo ?? '', colorHex: v?.colorHex ?? null, paquetes: s.paquetes, maplesPorPaquete: v?.maplesPorPaquete ?? 60,
        titulo: `Paquetes sueltos · ${v?.codigo ?? ''}`, detalle: `${s.paquetes} paquetes`, quitar: () => setSueltos((x) => x.filter((_, j) => j !== i)) };
    }),
  ];
  const codigos = useMemo(() => [...new Map(lineas.map((p) => [p.varianteId, p])).values()], [lineas]); // eslint-disable-line react-hooks/exhaustive-deps
  const maples = lineas.reduce((a, p) => a + p.paquetes * p.maplesPorPaquete, 0);
  const sueltosLibres = (id: string) => { const v = stock?.find((x) => x.id === id); return v ? v.producido - v.enPalets - sueltos.filter((s) => s.varianteId === id).reduce((a, s) => a + s.paquetes, 0) : 0; };

  // Precio del cliente (o de lista) al elegirlo.
  // (Va por useQuery para que quede guardado en el teléfono y sirva sin señal.)
  const { data: preciosCliente } = useQuery({ queryKey: ['precios-cliente', cliente?.id], queryFn: () => api<Record<string, number>>(`/precios/cliente/${cliente!.id}`), enabled: !!cliente });
  useEffect(() => { if (cliente) setVehiculo((v) => v ?? cliente.vehiculoHabitual); }, [cliente]);
  useEffect(() => {
    if (preciosCliente) setPrecios(Object.fromEntries(Object.entries(preciosCliente).map(([k, v]) => [k, aTexto(v)])));
  }, [preciosCliente]);

  const leido = async (texto: string) => {
    const id = idDePalet(texto);
    if (!id) return setLectura({ ok: false, texto: 'Ese código no es una etiqueta de palet.' });
    if (elegidos.includes(id)) return setLectura({ ok: true, texto: 'Ese palet ya está en la carga.' });
    let lista = disponibles ?? [];
    if (!lista.some((p) => p.id === id)) lista = (await refetch()).data ?? []; // armado recién en otro equipo
    const p = lista.find((x) => x.id === id);
    if (!p) {
      // No está disponible: decir por qué.
      const info = await api<{ numero: number; anuladoAt: string | null; venta: { numero: number; cliente: string } | null }>(`/palets/${id}`).catch(() => null);
      return setLectura({ ok: false, texto: !info ? 'No encontramos ese palet.' : info.venta ? `El palet ${nroTicket(info.numero)} ya se vendió a ${info.venta.cliente}.` : `El palet ${nroTicket(info.numero)} está desarmado.` });
    }
    setElegidos((e) => [...e, id]);
    setLectura({ ok: true, texto: `Palet ${nroTicket(p.numero)} · ${p.codigo} · ${p.paquetes} paquetes` });
  };

  const items = lineas.map((p) => ({ maples: p.paquetes * p.maplesPorPaquete, precioMaple: aCentavos(precios[p.varianteId] ?? '') ?? 0 }));
  const totales = calcularVenta(items, factura.conFactura ? factura.ivaBp : 0);
  const faltaPrecio = codigos.find((c) => !((aCentavos(precios[c.varianteId] ?? '') ?? 0) > 0));

  const carga = lineas.length > 0 && (
    <div className="hoja filas carrito">
      {lineas.map((p) => (
        <div className="fila" key={p.clave}>
          <Muestra color={p.colorHex} />
          <div>
            <div className="principal">{p.titulo}</div>
            <div className="chico tenue">{p.detalle} · {(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')} maples</div>
          </div>
          <button type="button" className="boton icono" aria-label={`Sacar ${p.titulo}`} onClick={p.quitar}><Trash2 size={18} /></button>
        </div>
      ))}
      <div className="fila"><span className="tenue">{palets.length} palets{sueltos.length ? ` y ${sueltos.reduce((a, s) => a + s.paquetes, 0)} paquetes sueltos` : ''}</span><span /><span className="cifra">{maples.toLocaleString('es-AR')} maples</span></div>
    </div>
  );
  const faltaDelPedido = pedido?.items.filter((i) => i.paquetes > i.despachado) ?? [];
  const agregarSuelto = () => {
    const n = Number(formSuelto?.cantidad);
    if (!formSuelto?.varianteId || !n || n < 1) return;
    setSueltos((s) => [...s, { varianteId: formSuelto.varianteId!, paquetes: n }]);
    setFormSuelto(null);
  };

  const pasos: Paso[] = [
    {
      titulo: 'Escaneá los palets que se van',
      ayuda: 'Apuntá la cámara a la etiqueta de cada palet que sube al camión. Se van sumando abajo. Si una etiqueta no se lee, elegilo de la lista.',
      contenido: (
        <>
          <div className="pestanas" role="group" aria-label="Cómo agregar palets">
            <button type="button" aria-pressed={modo === 'camara'} onClick={() => setModo('camara')}><ScanLine size={16} aria-hidden /> Cámara</button>
            <button type="button" aria-pressed={modo === 'lista'} onClick={() => setModo('lista')}><List size={16} aria-hidden /> Lista</button>
          </div>
          {modo === 'camara' ? (
            <Escaner onCodigo={(t) => void leido(t)} mensaje={lectura?.texto ?? 'Buscando una etiqueta…'} />
          ) : (
            <div className="opciones">
              {(disponibles ?? []).map((p) => (
                <button type="button" key={p.id} className="opcion" aria-pressed={elegidos.includes(p.id)} onClick={() => setElegidos(elegidos.includes(p.id) ? elegidos.filter((x) => x !== p.id) : [...elegidos, p.id])}>
                  <Muestra color={p.colorHex} />
                  <span style={{ flex: 1 }}><b>Palet {nroTicket(p.numero)} · {p.codigo}</b><small>{p.paquetes} paquetes{p.destino ? ` · para ${p.destino}` : ''}</small></span>
                </button>
              ))}
              {disponibles?.length === 0 && <p className="tenue">No hay palets armados sin vender.</p>}
            </div>
          )}
          {lectura && !lectura.ok && <Aviso>{lectura.texto}</Aviso>}
          {pedido && faltaDelPedido.length > 0 && (
            <p className="tenue chico">Pedido {nroTicket(pedido.numero)} de {pedido.cliente}: falta entregar {faltaDelPedido.map((i) => `${i.codigo} ${i.paquetes - i.despachado} paquetes`).join(', ')}.</p>
          )}
          {carga}
          {formSuelto ? (
            <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
              <b>Paquetes sueltos (sin palet)</b>
              <Opciones columnas valor={formSuelto.varianteId} onChange={(varianteId) => setFormSuelto({ ...formSuelto, varianteId })}
                opciones={(stock ?? []).filter((v) => sueltosLibres(v.id) > 0).map((v) => ({ valor: v.id, titulo: v.codigo, detalle: `${sueltosLibres(v.id)} sueltos` }))} />
              {formSuelto.varianteId && <EntradaNumero unidad="paq." value={formSuelto.cantidad} onChange={(e) => setFormSuelto({ ...formSuelto, cantidad: e.target.value.replace(/\D/g, '') })} aria-label="Cantidad de paquetes" autoFocus />}
              {formSuelto.varianteId && Number(formSuelto.cantidad) > sueltosLibres(formSuelto.varianteId) && <Aviso>Hay {sueltosLibres(formSuelto.varianteId)} paquetes sueltos de ese maple.</Aviso>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="boton primario" disabled={!formSuelto.varianteId || !Number(formSuelto.cantidad) || Number(formSuelto.cantidad) > sueltosLibres(formSuelto.varianteId)} onClick={agregarSuelto}>Agregar</button>
                <button type="button" className="boton fantasma" onClick={() => setFormSuelto(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="boton secundario" style={{ justifySelf: 'start' }} onClick={() => setFormSuelto({ varianteId: null, cantidad: '' })}>+ Paquetes sueltos (sin palet)</button>
          )}
        </>
      ),
      listo: lineas.length ? true : 'Escaneá al menos un palet o agregá paquetes sueltos',
    },
    {
      titulo: '¿Para quién es?',
      ayuda: 'El cliente que compra. Si es la primera vez, agregalo con el nombre.',
      contenido: <ElegirCliente valor={cliente} onChange={setCliente} />,
      listo: cliente ? true : 'Elegí el cliente',
    },
    ...(!params.get('pedido') && pedidosCliente?.length ? [{
      titulo: '¿Es de un pedido?',
      ayuda: 'Este cliente tiene pedidos sin entregar. Si esta carga es de uno, elegilo: el pedido se cierra solo cuando se entrega todo.',
      contenido: (
        <Opciones<string | null> valor={pedidoId} onChange={setPedidoId} opciones={[
          ...pedidosCliente.map((p) => ({ valor: p.id, titulo: `Pedido ${nroTicket(p.numero)}${p.fechaEntrega ? ` · para el ${verFecha(p.fechaEntrega)}` : ''}`, detalle: p.resumen })),
          { valor: null, titulo: 'No, es una venta sin pedido' },
        ]} />
      ),
      listo: true,
    } as Paso] : []),
    {
      titulo: '¿Quién se lo lleva?',
      ayuda: 'Anotá el nombre de quien retira y en qué vehículo. Queda en el remito para firmar.',
      contenido: (
        <>
          <Campo etiqueta="Nombre de quien retira"><Entrada value={retira} onChange={(e) => setRetira(e.target.value)} autoFocus placeholder="Ej.: Juan Pérez, chofer" /></Campo>
          <Campo etiqueta="Vehículo"><Opciones columnas valor={vehiculo} onChange={setVehiculo} opciones={VEHICULOS.map((v) => ({ valor: v, titulo: LABEL_VEHICULO[v] }))} /></Campo>
          <Campo etiqueta="Patente" ayuda="Opcional"><Entrada value={patente} onChange={(e) => setPatente(e.target.value)} autoCapitalize="characters" /></Campo>
        </>
      ),
      listo: retira.trim().length < 2 ? 'Anotá quién se lo lleva' : true,
    },
    {
      titulo: 'Precio',
      ayuda: cambiaPrecios ? 'Precio por maple: el especial del cliente o el de lista. Cambialo solo si para esta venta es otro.' : 'Se cobra el precio por maple del cliente o el de lista.',
      contenido: (
        <>
          {codigos.map((c) => (
            <Campo key={c.varianteId} etiqueta={`${c.codigo}: precio por maple`} ayuda={`${palets.filter((p) => p.varianteId === c.varianteId).reduce((a, p) => a + p.paquetes * p.maplesPorPaquete, 0).toLocaleString('es-AR')} maples`}>
              <EntradaNumero unidad="$" value={precios[c.varianteId] ?? ''} disabled={!cambiaPrecios} onChange={(e) => setPrecios({ ...precios, [c.varianteId]: e.target.value })} />
            </Campo>
          ))}
          <div className="lectura"><span>Total sin IVA</span><span className="cifra">{formatPesos(totales.neto)}</span></div>
        </>
      ),
      // Sin señal y sin precio guardado: se sigue igual; al subirse, el sistema usa el precio del cliente o el de lista.
      listo: faltaPrecio && navigator.onLine ? (cambiaPrecios ? `Falta el precio del ${faltaPrecio.codigo}` : `El ${faltaPrecio.codigo} no tiene precio cargado: pedile a administración que lo cargue en Precios.`) : true,
    },
    {
      titulo: '¿Lleva factura?',
      ayuda: 'Marcá si esta venta se factura. No emite la factura: solo deja registrado si va en blanco o en negro.',
      contenido: <PasoFactura v={factura} set={setFactura} />,
      listo: facturaLista(factura),
    },
    {
      titulo: 'Que firme quien retira',
      ayuda: 'Pasale el teléfono o el iPad a quien se lleva la carga para que firme con el dedo. Si preferís, seguí sin firma e imprimí el remito para firmar en papel.',
      contenido: (
        <>
          <p className="tenue">{retira} recibe {maples.toLocaleString('es-AR')} maples para {cliente?.nombre}.</p>
          <Firma onCambio={setFirma} />
        </>
      ),
      listo: true,
    },
    {
      titulo: 'Revisá y confirmá',
      ayuda: 'Al confirmar, los palets quedan vendidos a este cliente y se genera el remito para que firme quien retira.',
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>Cliente</dt><dd>{cliente?.nombre}</dd>
            <dt>Retira</dt><dd>{retira}{vehiculo ? ` · ${LABEL_VEHICULO[vehiculo]}` : ''}{patente ? ` · ${patente.toUpperCase()}` : ''}</dd>
            <dt>Factura</dt><dd>{factura.conFactura ? `Sí · ${formatIva(factura.ivaBp)}` : 'No'}</dd>
          </dl>
          {carga}
          <div className="lectura"><span>Total{totales.iva ? ' con IVA' : ''}</span><span className="cifra">{formatPesos(totales.total)}</span></div>
          <Campo etiqueta="Fecha" ayuda={fecha === hoy() ? 'Hoy' : verFecha(fecha)}><Entrada type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Notas" ayuda="Opcional"><textarea className="entrada" value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        </>
      ),
      listo: true,
    },
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await enviarOGuardar<{ id: string }>('/ventas', {
        clienteId: cliente!.id, fecha, palets: elegidos, sueltos, pedidoId, firma, retira, vehiculo, patente: patente || undefined, notas: notas || undefined, ...facturaBody(factura),
        // Solo los precios conocidos: si alguno falta (sin señal), el sistema usa el del cliente o el de lista.
        precios: cambiaPrecios ? codigos.map((c) => ({ varianteId: c.varianteId, precioMaple: aCentavos(precios[c.varianteId] ?? '') ?? 0 })).filter((x) => x.precioMaple > 0) : [],
      }, `despacho a ${cliente!.nombre}`);
      if (r.guardado) { navegar('/', { replace: true, state: { aviso: 'Despacho guardado en el teléfono: se sube solo cuando vuelva la señal. El remito se imprime después desde Ventas.' } }); return; }
      await qc.invalidateQueries();
      navegar(`/ventas/${r.data.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return <Asistente proceso="despacho" pasos={pasos} onTerminar={guardar} textoTerminar="Confirmar despacho" guardando={guardando} error={error} onCancelar={() => navegar('/ventas')} />;
}
