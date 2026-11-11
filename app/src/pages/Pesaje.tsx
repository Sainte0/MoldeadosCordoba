import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { aCentavos, aMili, calcularCompra, formatCantidad, formatIva, formatPesos } from '@moldeados/shared/base';
import { api, hoy, verFecha } from '../api';
import { enviarOGuardar } from '../cola';
import { useMaterias, type Proveedor } from '../datos';
import { Asistente, Campo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';
import { ElegirProveedor, asegurarProveedor } from './ElegirProveedor';
import { PasoFactura, facturaBody, facturaLista, type DatosFactura } from './Factura';

/** Ticket de pesaje: el camión entra cargado, se pesa, descarga, se pesa vacío. Neto = bruto − tara. */
export function Pesaje() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: materias } = useMaterias();
  const cartones = useMemo(() => (materias ?? []).filter((m) => m.tipo === 'carton' && m.activo), [materias]);

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [materiaId, setMateriaId] = useState<string | null>(null);
  const [bruto, setBruto] = useState('');
  const [tara, setTara] = useState('');
  const [patente, setPatente] = useState('');
  const [precio, setPrecio] = useState('');
  const [factura, setFactura] = useState<DatosFactura>({ conFactura: null, nroFactura: '', ivaBp: 0 });
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un solo tipo de cartón cargado: se elige solo y el paso no aparece.
  useEffect(() => { if (cartones.length === 1) setMateriaId(cartones[0]!.id); }, [cartones]);

  // Precio sugerido: el último que se le pagó a este proveedor por este cartón.
  useEffect(() => {
    if (!proveedor?.id || !materiaId) return;
    api<number | null>(`/compras/ultimo-precio?proveedorId=${proveedor.id}&materiaPrimaId=${materiaId}`)
      .then((p) => { if (p !== null) setPrecio((v) => v || String(p / 100).replace('.', ',')); })
      .catch(() => {});
  }, [proveedor, materiaId]);

  const brutoG = aMili(bruto), taraG = tara.trim() === '' ? 0 : aMili(tara);
  const netoG = brutoG !== null && taraG !== null ? brutoG - taraG : null;
  const precioC = aCentavos(precio);
  const totales = netoG && netoG > 0 && precioC !== null ? calcularCompra([{ cantidad: netoG, precioUnitario: precioC }], factura.conFactura ? factura.ivaBp : 0) : null;
  const carton = cartones.find((c) => c.id === materiaId);

  const pasos: Paso[] = [
    {
      titulo: '¿Quién trae el cartón?',
      ayuda: 'Elegí el proveedor del camión que está en la báscula. Si es la primera vez que viene, agregalo con el nombre y seguí.',
      contenido: <ElegirProveedor tipo="carton" valor={proveedor} onChange={setProveedor} />,
      listo: proveedor ? true : 'Elegí un proveedor para seguir',
      rapido: true,
    },
    ...(cartones.length > 1 ? [{
      titulo: '¿Qué cartón es?',
      ayuda: 'Elegí el tipo de cartón que descarga.',
      contenido: <Opciones valor={materiaId} onChange={setMateriaId} opciones={cartones.map((c) => ({ valor: c.id, titulo: c.nombre }))} />,
      listo: materiaId ? true : 'Elegí el tipo de cartón',
      rapido: true,
    }] : []),
    {
      titulo: 'Anotá la pesada',
      ayuda: 'Pesá el camión cargado (bruto). Cuando descarga, pesalo vacío (tara). El sistema calcula los kilos de cartón.',
      contenido: (
        <>
          <Campo etiqueta="Peso bruto (camión cargado)">
            <EntradaNumero enorme unidad="kg" value={bruto} onChange={(e) => setBruto(e.target.value)} autoFocus />
          </Campo>
          <Campo etiqueta="Tara (camión vacío)">
            <EntradaNumero enorme unidad="kg" value={tara} onChange={(e) => setTara(e.target.value)} />
          </Campo>
          {netoG !== null && netoG > 0 && carton && (
            <div className="lectura"><span>Cartón neto</span><span className="cifra">{formatCantidad(netoG, 'kg')}</span></div>
          )}
          <Campo etiqueta="Patente" ayuda="Opcional">
            <Entrada value={patente} onChange={(e) => setPatente(e.target.value)} autoCapitalize="characters" maxLength={15} />
          </Campo>
        </>
      ),
      listo: brutoG === null || brutoG <= 0 ? 'Ingresá el peso bruto' : taraG === null ? 'La tara no es un número válido' : netoG! <= 0 ? 'El bruto tiene que ser mayor que la tara' : true,
    },
    {
      titulo: '¿A cuánto el kilo?',
      ayuda: 'Precio acordado por kilo de cartón, sin IVA. Te sugerimos el de la última vez con este proveedor.',
      contenido: (
        <>
          <EntradaNumero enorme unidad="$/kg" value={precio} onChange={(e) => setPrecio(e.target.value)} autoFocus aria-label="Precio por kilo" />
          {totales && <div className="lectura"><span>Total de la carga</span><span className="cifra">{formatPesos(totales.neto)}</span></div>}
        </>
      ),
      listo: precioC === null || precioC < 0 ? 'Ingresá el precio por kilo' : true,
    },
    {
      titulo: '¿Vino con factura?',
      ayuda: 'El cartón a veces se factura y a veces no. Marcalo como corresponda: así las cuentas en blanco y en negro quedan separadas.',
      contenido: <PasoFactura v={factura} set={setFactura} />,
      listo: facturaLista(factura),
    },
    {
      titulo: 'Revisá y guardá',
      ayuda: 'Controlá los datos. Al guardar se suma el cartón al stock y se genera el ticket para imprimir.',
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>Proveedor</dt><dd>{proveedor?.nombre}</dd>
            <dt>Cartón</dt><dd>{carton?.nombre}</dd>
            <dt>Bruto / tara</dt><dd className="cifra">{brutoG !== null && formatCantidad(brutoG, 'kg')} / {formatCantidad(taraG ?? 0, 'kg')}</dd>
            <dt>Neto</dt><dd className="cifra">{netoG !== null && formatCantidad(netoG, 'kg')}</dd>
            <dt>Precio</dt><dd>{precioC !== null && formatPesos(precioC)} por kg</dd>
            <dt>Factura</dt><dd>{factura.conFactura ? `Sí · ${formatIva(factura.ivaBp)}` : 'No'}</dd>
            {patente && <><dt>Patente</dt><dd>{patente.toUpperCase()}</dd></>}
          </dl>
          {totales && <div className="lectura"><span>Total{totales.iva ? ' con IVA' : ''}</span><span className="cifra">{formatPesos(totales.total)}</span></div>}
          <Campo etiqueta="Fecha" ayuda={fecha === hoy() ? 'Hoy' : verFecha(fecha)}>
            <Entrada type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Observaciones" ayuda="Opcional: humedad, estado del cartón, algo para recordar.">
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
      // Proveedor nuevo: se crea recién ahora; si algo falla después, el reintento ya lo usa.
      const prov = await asegurarProveedor(proveedor!);
      setProveedor(prov);
      const body = { proveedorId: prov.id, materiaPrimaId: materiaId, fecha, brutoG, taraG, precioPorKg: precioC, patente: patente || undefined, notas: notas || undefined, ...facturaBody(factura) };
      const r = await enviarOGuardar<{ id: string }>('/compras/pesaje', body, `pesaje de ${proveedor!.nombre}`);
      if (r.guardado) { navegar('/', { replace: true, state: { aviso: 'Pesaje guardado en el teléfono: se sube solo cuando vuelva la señal (el ticket se imprime después).' } }); return; }
      await qc.invalidateQueries();
      navegar(`/compras/${r.data.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  if (materias && cartones.length === 0) {
    return <div className="columna"><h1>Falta el cartón</h1><p className="tenue" style={{ marginTop: 8 }}>No hay ningún cartón activo en Materia prima. Pedile al encargado que lo dé de alta.</p></div>;
  }
  return <Asistente proceso="pesaje" pasos={pasos} onTerminar={guardar} textoTerminar="Guardar ticket" guardando={guardando} error={error} onCancelar={() => navegar('/')} />;
}
