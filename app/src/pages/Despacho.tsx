import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { List, ScanLine, Trash2 } from 'lucide-react';
import { aCentavos, calcularVenta, formatIva, formatPesos, LABEL_VEHICULO, VEHICULOS, type Vehiculo } from '@moldeados/shared/base';
import { api, hoy, nroTicket, useSesion, verFecha } from '../api';
import type { Cliente, PaletDisponible } from '../datos';
import { Escaner, idDePalet } from '../Escaner';
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palets = (disponibles ?? []).filter((p) => elegidos.includes(p.id));
  const codigos = useMemo(() => [...new Map(palets.map((p) => [p.varianteId, p])).values()], [palets]);
  const maples = palets.reduce((a, p) => a + p.paquetes * p.maplesPorPaquete, 0);

  // Precio del cliente (o de lista) al elegirlo.
  useEffect(() => {
    if (!cliente) return;
    setVehiculo((v) => v ?? cliente.vehiculoHabitual);
    api<Record<string, number>>(`/precios/cliente/${cliente.id}`)
      .then((p) => setPrecios(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, aTexto(v)]))))
      .catch(() => {});
  }, [cliente]);

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

  const items = palets.map((p) => ({ maples: p.paquetes * p.maplesPorPaquete, precioMaple: aCentavos(precios[p.varianteId] ?? '') ?? 0 }));
  const totales = calcularVenta(items, factura.conFactura ? factura.ivaBp : 0);
  const faltaPrecio = codigos.find((c) => !((aCentavos(precios[c.varianteId] ?? '') ?? 0) > 0));

  const carga = palets.length > 0 && (
    <div className="hoja filas carrito">
      {palets.map((p) => (
        <div className="fila" key={p.id}>
          <Muestra color={p.colorHex} />
          <div>
            <div className="principal">Palet {nroTicket(p.numero)} · {p.codigo}</div>
            <div className="chico tenue">{p.paquetes} paquetes ({p.ancho}×{p.largo}×{p.alto}) · {(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')} maples</div>
          </div>
          <button type="button" className="boton icono" aria-label={`Sacar palet ${nroTicket(p.numero)}`} onClick={() => setElegidos(elegidos.filter((x) => x !== p.id))}><Trash2 size={18} /></button>
        </div>
      ))}
      <div className="fila"><span className="tenue">{palets.length} palets</span><span /><span className="cifra">{maples.toLocaleString('es-AR')} maples</span></div>
    </div>
  );

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
          {carga}
        </>
      ),
      listo: palets.length ? true : 'Escaneá al menos un palet',
    },
    {
      titulo: '¿Para quién es?',
      ayuda: 'El cliente que compra. Si es la primera vez, agregalo con el nombre.',
      contenido: <ElegirCliente valor={cliente} onChange={setCliente} />,
      listo: cliente ? true : 'Elegí el cliente',
    },
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
      listo: faltaPrecio ? (cambiaPrecios ? `Falta el precio del ${faltaPrecio.codigo}` : `El ${faltaPrecio.codigo} no tiene precio cargado: pedile a administración que lo cargue en Precios.`) : true,
    },
    {
      titulo: '¿Lleva factura?',
      ayuda: 'Marcá si esta venta se factura. No emite la factura: solo deja registrado si va en blanco o en negro.',
      contenido: <PasoFactura v={factura} set={setFactura} />,
      listo: facturaLista(factura),
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
      const r = await api<{ id: string }>('/ventas', {
        method: 'POST',
        body: {
          clienteId: cliente!.id, fecha, palets: elegidos, retira, vehiculo, patente: patente || undefined, notas: notas || undefined, ...facturaBody(factura),
          precios: cambiaPrecios ? codigos.map((c) => ({ varianteId: c.varianteId, precioMaple: aCentavos(precios[c.varianteId] ?? '') ?? 0 })) : [],
        },
      });
      await qc.invalidateQueries();
      navegar(`/ventas/${r.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return <Asistente proceso="despacho" pasos={pasos} onTerminar={guardar} textoTerminar="Confirmar despacho" guardando={guardando} error={error} onCancelar={() => navegar('/ventas')} />;
}
