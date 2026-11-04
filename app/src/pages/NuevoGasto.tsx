import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, X } from 'lucide-react';
import { aCentavos, formatPesos, LABEL_MEDIO_GASTO, MEDIOS_GASTO, type MedioGasto } from '@moldeados/shared/base';
import { api, comprimirFoto, hoy, verFecha } from '../api';
import { useBancos, useCaja, useCategoriasGasto, useEmpleados } from '../datos';
import { Asistente, Aviso, Campo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';

// ponytail: la categoría "de sueldos" se reconoce por el nombre; si renombran todo, agregar un tipo a la categoría.
const esSueldo = (nombre?: string) => !!nombre && /sueldo|adelanto|jornal/i.test(nombre);

/** Egreso: de qué es, cuánto y a quién, si ya se pagó (y cómo) o queda pendiente, y la foto del comprobante. */
export function NuevoGasto() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: categorias } = useCategoriasGasto();
  const { data: empleados } = useEmpleados();
  const { data: bancos } = useBancos();
  const { data: caja } = useCaja();

  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);
  const [medio, setMedio] = useState<MedioGasto | null>(null);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ mime: 'image/jpeg'; base64: string; vista: string } | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [conFactura, setConFactura] = useState<boolean | null>(null);
  const [nroFactura, setNroFactura] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [beneficiario, setBeneficiario] = useState('');
  const [usd, setUsd] = useState('');
  // Como la columna "Estado" de la planilla: Pagado, o Pendiente (F-931, IVA, una factura a pagar) con su vencimiento.
  const [estado, setEstado] = useState<'pagado' | 'pendiente' | null>(null);
  const [vencimiento, setVencimiento] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoria = categorias?.find((c) => c.id === categoriaId);
  const centavos = aCentavos(monto);
  const necesitaBanco = medio === 'transferencia' || medio === 'echeq' || medio === 'cheque';

  const pasos: Paso[] = [
    {
      titulo: '¿De qué es el egreso?',
      ayuda: 'Elegí la categoría. Así el balance muestra en qué se va la plata, como el desglose por categoría de la planilla.',
      contenido: <Opciones columnas valor={categoriaId} onChange={setCategoriaId} opciones={(categorias ?? []).filter((c) => c.activo).map((c) => ({ valor: c.id, titulo: c.nombre }))} />,
      listo: categoriaId ? true : 'Elegí una categoría',
      rapido: true,
    },
    {
      titulo: '¿Cuánto y qué es?',
      ayuda: 'El monto total, el concepto en pocas palabras y a quién se le paga (proveedor o beneficiario).',
      contenido: (
        <>
          <EntradaNumero enorme unidad="$" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus aria-label="Monto" />
          <Campo etiqueta="Concepto / descripción"><Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={esSueldo(categoria?.nombre) ? 'Adelanto quincena' : 'Ej.: materiales eléctricos'} /></Campo>
          {!esSueldo(categoria?.nombre) && <Campo etiqueta="Proveedor / beneficiario" ayuda="Opcional"><Entrada value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} placeholder="Ej.: Electro Alem, ARCA, Kevin" /></Campo>}
          <Campo etiqueta="Monto en dólares" ayuda="Opcional, solo si se pagó en dólares (ej.: tinta importada)"><EntradaNumero unidad="US$" value={usd} onChange={(e) => setUsd(e.target.value)} /></Campo>
          {esSueldo(categoria?.nombre) && (
            <Campo etiqueta="¿A quién?">
              <Opciones columnas valor={empleadoId} onChange={setEmpleadoId} opciones={(empleados ?? []).filter((e) => e.activo).map((e) => ({ valor: e.id, titulo: e.nombre }))} />
            </Campo>
          )}
        </>
      ),
      listo: centavos === null || centavos <= 0 ? 'Ingresá el monto' : descripcion.trim().length < 2 ? 'Contá qué se pagó' : true,
    },
    {
      titulo: '¿Ya se pagó?',
      ayuda: 'Pagado: elegí la forma de pago (si salió de la caja chica, se descuenta solo). Pendiente: queda en la lista de egresos a pagar y avisa antes del vencimiento.',
      contenido: (
        <>
          <Opciones columnas valor={estado} onChange={setEstado} opciones={[{ valor: 'pagado', titulo: 'Pagado' }, { valor: 'pendiente', titulo: 'Pendiente', detalle: 'Se paga más adelante' }]} />
          {estado === 'pendiente' && <Campo etiqueta="Vence el" ayuda="Opcional: el sistema avisa 3 días antes"><Entrada type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></Campo>}
          {estado === 'pagado' && <Campo etiqueta="Forma de pago"><Opciones columnas valor={medio} onChange={setMedio}
            opciones={MEDIOS_GASTO.map((m) => ({ valor: m, titulo: LABEL_MEDIO_GASTO[m], detalle: m === 'caja_chica' && caja ? `Hay ${formatPesos(caja.saldo)}` : undefined }))} />
          </Campo>}
          {estado === 'pagado' && necesitaBanco && <Campo etiqueta="Banco"><Opciones columnas valor={bancoId} onChange={setBancoId} opciones={(bancos ?? []).filter((b) => b.activo).map((b) => ({ valor: b.id, titulo: b.nombre }))} /></Campo>}
          {estado === 'pagado' && medio === 'caja_chica' && caja && centavos !== null && centavos > caja.saldo && <Aviso>En la caja chica hay {formatPesos(caja.saldo)}. Si se repuso, cargá la reposición en Caja chica.</Aviso>}
        </>
      ),
      listo: !estado ? 'Marcá si ya se pagó' : estado === 'pendiente' ? true : !medio ? 'Elegí la forma de pago' : (medio === 'echeq' || medio === 'cheque') && !bancoId ? 'Elegí el banco' : true,
    },
    {
      titulo: 'Sacale una foto al comprobante',
      ayuda: 'Ticket, factura o recibo. Queda guardado junto al egreso. Si no hay comprobante, seguí sin foto.',
      contenido: (
        <>
          {foto ? (
            <div style={{ position: 'relative' }}>
              <img src={foto.vista} alt="Comprobante" style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 14, background: '#fff' }} />
              <button type="button" className="boton secundario" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => setFoto(null)}><X size={18} aria-hidden /> Sacar otra</button>
            </div>
          ) : (
            <label className="boton secundario grande" style={{ cursor: 'pointer' }}>
              <Camera size={22} aria-hidden /> Sacar foto
              {/* capture abre directo la cámara trasera en el iPhone */}
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setErrorFoto(null);
                  try { setFoto(await comprimirFoto(f)); } catch { setErrorFoto('No pudimos leer esa foto. Probá de nuevo.'); }
                }} />
            </label>
          )}
          <Aviso>{errorFoto}</Aviso>
          <Campo etiqueta="¿Tiene factura?">
            <Opciones columnas valor={conFactura} onChange={setConFactura} opciones={[{ valor: true, titulo: 'Con factura' }, { valor: false, titulo: 'Sin factura' }]} />
          </Campo>
          {conFactura && <Campo etiqueta="N° comprobante" ayuda="Opcional (ej.: A-3169, F-931 07-2026)"><Entrada value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} /></Campo>}
        </>
      ),
      listo: conFactura === null ? 'Marcá si tiene factura' : true,
    },
    {
      titulo: 'Revisá y guardá',
      ayuda: 'Controlá los datos antes de guardar.',
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>Categoría</dt><dd>{categoria?.nombre}</dd>
            <dt>Concepto</dt><dd>{descripcion}{empleadoId ? ` · ${empleados?.find((e) => e.id === empleadoId)?.nombre}` : ''}</dd>
            {beneficiario && <><dt>Beneficiario</dt><dd>{beneficiario}</dd></>}
            <dt>Estado</dt><dd>{estado === 'pendiente' ? `Pendiente${vencimiento ? ` · vence ${verFecha(vencimiento)}` : ''}` : <>Pagado · {medio && LABEL_MEDIO_GASTO[medio]}{bancoId && necesitaBanco ? ` · ${bancos?.find((b) => b.id === bancoId)?.nombre}` : ''}</>}</dd>
            <dt>Comprobante</dt><dd>{foto ? 'Con foto' : 'Sin foto'} · {conFactura ? 'con factura' : 'sin factura'}</dd>
          </dl>
          <div className="lectura"><span>Egreso</span><span className="cifra">{centavos !== null && formatPesos(centavos)}</span></div>
          <Campo etiqueta="Fecha" ayuda={fecha === hoy() ? 'Hoy' : verFecha(fecha)}><Entrada type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></Campo>
        </>
      ),
      listo: true,
    },
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const comprobante = foto ? await api<{ id: string }>('/archivos', { method: 'POST', body: { mime: foto.mime, base64: foto.base64 } }) : null;
      await api('/gastos', {
        method: 'POST',
        body: {
          fecha, categoriaId, descripcion, monto: centavos, medio: medio ?? 'efectivo', bancoId: necesitaBanco && estado === 'pagado' ? bancoId : null, conFactura: !!conFactura,
          beneficiario: beneficiario || undefined, aPagar: estado === 'pendiente', vencimiento: estado === 'pendiente' && vencimiento ? vencimiento : null, montoUsd: aCentavos(usd) || null,
          nroFactura: conFactura ? nroFactura || undefined : undefined, empleadoId: esSueldo(categoria?.nombre) ? empleadoId : null, comprobanteId: comprobante?.id ?? null,
        },
      });
      await qc.invalidateQueries();
      navegar('/egresos?nuevo=1', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return <Asistente proceso="gasto" pasos={pasos} onTerminar={guardar} textoTerminar="Guardar egreso" guardando={guardando} error={error} onCancelar={() => navegar('/egresos')} />;
}
