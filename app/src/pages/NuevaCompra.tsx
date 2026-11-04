import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { aCentavos, aMili, calcularCompra, formatCantidad, formatIva, formatPesos, subtotalItem } from '@moldeados/shared/base';
import { api, hoy, verFecha } from '../api';
import { useMaterias, type Proveedor } from '../datos';
import { Asistente, Aviso, Campo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';
import { ElegirProveedor } from './ElegirProveedor';
import { PasoFactura, facturaBody, facturaLista, type DatosFactura } from './Factura';

interface Item { materiaPrimaId: string; cantidad: number; precioUnitario: number }

/** Compra de tinta, aglutinante u otros (el cartón entra por Pesaje). Puede tener varios productos. */
export function NuevaCompra() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: materias } = useMaterias();
  const activas = (materias ?? []).filter((m) => m.activo);

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [mpId, setMpId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [errorItem, setErrorItem] = useState<string | null>(null);
  const [factura, setFactura] = useState<DatosFactura>({ conFactura: null, nroFactura: '', ivaBp: 0 });
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mp = (id: string) => activas.find((m) => m.id === id);
  const elegirMp = (id: string) => {
    setMpId(id);
    setPrecio('');
    if (proveedor) {
      api<number | null>(`/compras/ultimo-precio?proveedorId=${proveedor.id}&materiaPrimaId=${id}`)
        .then((p) => p !== null && setPrecio(String(p / 100).replace('.', ',')))
        .catch(() => {});
    }
  };
  const agregar = () => {
    const c = aMili(cantidad), p = aCentavos(precio);
    if (!mpId) return setErrorItem('Elegí qué compraste');
    if (c === null || c <= 0) return setErrorItem('Ingresá la cantidad');
    if (p === null || p < 0) return setErrorItem('Ingresá el precio');
    setItems([...items, { materiaPrimaId: mpId, cantidad: c, precioUnitario: p }]);
    setMpId(null); setCantidad(''); setPrecio(''); setErrorItem(null);
  };

  const totales = calcularCompra(items, factura.conFactura ? factura.ivaBp : 0);
  const unidadMp = mpId ? (mp(mpId)?.unidad === 'kg' ? 'kg' : 'L') : '';

  const listaItems = items.length > 0 && (
    <div className="hoja filas">
      {items.map((it, i) => {
        const m = mp(it.materiaPrimaId);
        return (
          <div className="fila" key={i}>
            <div>
              <div className="principal">{m?.nombre}</div>
              <div className="chico tenue">{m && formatCantidad(it.cantidad, m.unidad)} a {formatPesos(it.precioUnitario)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="cifra">{formatPesos(subtotalItem(it.cantidad, it.precioUnitario))}</span>
              <button type="button" className="boton icono" aria-label={`Quitar ${m?.nombre}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const pasos: Paso[] = [
    {
      titulo: '¿A quién le compraste?',
      ayuda: 'Elegí el proveedor. Para cargar cartón que llega en camión usá Pesaje de cartón.',
      contenido: <ElegirProveedor valor={proveedor} onChange={setProveedor} />,
      listo: proveedor ? true : 'Elegí un proveedor para seguir',
    },
    {
      titulo: '¿Qué compraste?',
      ayuda: 'Agregá cada producto con su cantidad y precio por litro o kilo, sin IVA. Si son varios, agregalos uno por uno.',
      contenido: (
        <>
          {listaItems}
          <div className="hoja relleno" style={{ display: 'grid', gap: 14 }}>
            <Opciones columnas valor={mpId} onChange={elegirMp} opciones={activas.map((m) => ({ valor: m.id, titulo: m.nombre, detalle: m.unidad === 'kg' ? 'por kilo' : 'por litro' }))} />
            {mpId && (
              <>
                <Campo etiqueta="Cantidad"><EntradaNumero unidad={unidadMp} value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus /></Campo>
                <Campo etiqueta={`Precio por ${unidadMp === 'kg' ? 'kilo' : 'litro'}`}><EntradaNumero unidad="$" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Campo>
                <Aviso>{errorItem}</Aviso>
                <button type="button" className="boton secundario" onClick={agregar}><Plus size={18} aria-hidden /> Agregar a la compra</button>
              </>
            )}
          </div>
        </>
      ),
      listo: items.length > 0 ? true : 'Agregá al menos un producto',
    },
    {
      titulo: '¿Vino con factura?',
      ayuda: 'La tinta y el aglutinante normalmente vienen con factura. Elegí la alícuota de IVA que figura en la factura.',
      contenido: <PasoFactura v={factura} set={setFactura} />,
      listo: facturaLista(factura),
    },
    {
      titulo: 'Revisá y guardá',
      ayuda: 'Al guardar se suma lo comprado al stock de materia prima.',
      contenido: (
        <>
          <p><b>{proveedor?.nombre}</b> · {factura.conFactura ? `Con factura, ${formatIva(factura.ivaBp)}` : 'Sin factura'}</p>
          {listaItems}
          <div className="lectura"><span>Total{totales.iva ? ` (IVA ${formatPesos(totales.iva)})` : ''}</span><span className="cifra">{formatPesos(totales.total)}</span></div>
          <Campo etiqueta="Fecha" ayuda={fecha === hoy() ? 'Hoy' : verFecha(fecha)}>
            <Entrada type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Notas" ayuda="Opcional">
            <textarea className="entrada" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
        </>
      ),
      listo: true,
    },
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await api<{ id: string }>('/compras', { method: 'POST', body: { proveedorId: proveedor!.id, fecha, items, notas: notas || undefined, ...facturaBody(factura) } });
      await qc.invalidateQueries();
      navegar(`/compras/${r.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return <Asistente proceso="compra" pasos={pasos} onTerminar={guardar} textoTerminar="Guardar compra" guardando={guardando} error={error} onCancelar={() => navegar('/compras')} />;
}
