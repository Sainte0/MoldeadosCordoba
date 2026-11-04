import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aCentavos, formatPesos, LABEL_MEDIO, MEDIOS, type Medio } from '@moldeados/shared/base';
import { api, hoy, verFecha } from '../api';
import { useBancos, type Cliente, type Proveedor } from '../datos';
import { Asistente, Campo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';
import { ElegirCliente } from './ElegirCliente';
import { ElegirProveedor } from './ElegirProveedor';

/** Cobro a un cliente o pago a un proveedor, paso a paso. */
export function NuevoMovimiento() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const tipo = params.get('tipo') === 'pago' ? 'pago' : 'cobro';
  const de = tipo === 'cobro' ? 'cliente' : 'proveedor';
  const preId = params.get('id');
  const { data: bancos } = useBancos();
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);
  const { data: pre } = useQuery({ queryKey: ['cuenta', de, preId], queryFn: () => api<{ id: string; nombre: string; movimientos: { saldo: number }[] }>(`/cuentas/${de}/${preId}`), enabled: !!preId });
  const { data: cuenta } = useQuery({ queryKey: ['cuenta', de, quien?.id], queryFn: () => api<{ movimientos: { saldo: number }[] }>(`/cuentas/${de}/${quien!.id}`), enabled: !!quien });
  useEffect(() => { if (pre && !quien) setQuien({ id: pre.id, nombre: pre.nombre }); }, [pre, quien]);

  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState<Medio | 'endoso' | null>(null);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [endosoDe, setEndosoDe] = useState<string | null>(null);
  const { data: cheques } = useQuery({ queryKey: ['cheques'], queryFn: () => api<{ id: string; tipo: string; estado: string | null; monto: number; banco: string | null; chequeNumero: string | null; chequeFechaCobro: string | null; contraparte: string }[]>('/cheques'), enabled: tipo === 'pago' });
  const cartera = (cheques ?? []).filter((c) => c.tipo === 'cobro' && c.estado === 'cartera');
  const [nro, setNro] = useState('');
  const [fechaCobro, setFechaCobro] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saldo = cuenta?.movimientos.at(-1)?.saldo ?? 0;
  const endosado = cartera.find((c) => c.id === endosoDe);
  const centavos = medio === 'endoso' ? endosado?.monto ?? null : aCentavos(monto);
  const esCheque = medio === 'cheque' || medio === 'echeq';
  const verbo = tipo === 'cobro' ? 'cobraste' : 'pagaste';

  const pasos: Paso[] = [
    ...(preId ? [] : [{
      titulo: tipo === 'cobro' ? '¿Quién pagó?' : '¿A quién le pagaste?',
      ayuda: tipo === 'cobro' ? 'Elegí el cliente que pagó.' : 'Elegí el proveedor al que le pagaste.',
      contenido: tipo === 'cobro'
        ? <ElegirCliente conDeuda valor={quien as Cliente | null} onChange={(c) => setQuien(c)} />
        : <ElegirProveedor valor={quien as Proveedor | null} onChange={(p) => setQuien(p)} />,
      listo: quien ? true : 'Elegí uno para seguir',
      rapido: true,
    } as Paso]),
    {
      titulo: '¿Cómo?',
      ayuda: 'El medio de pago.',
      contenido: <Opciones columnas valor={medio} onChange={(m) => { setMedio(m); setEndosoDe(null); }} opciones={[...MEDIOS, ...(tipo === 'pago' ? ['endoso' as const] : [])].map((m) => ({
        valor: m, titulo: LABEL_MEDIO[m], detalle: m === 'endoso' ? `${cartera.length} en cartera` : undefined,
      }))} />,
      listo: medio ? true : 'Elegí el medio',
      rapido: true,
    },
    ...(medio === 'endoso' ? [] : [{
      titulo: `¿Cuánto ${verbo}?`,
      ayuda: saldo > 0 ? `${quien?.nombre} tiene un saldo de ${formatPesos(saldo)}. Podés registrar un pago parcial.` : 'Ingresá el monto total del pago.',
      contenido: (
        <>
          <EntradaNumero enorme unidad="$" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus aria-label="Monto" />
          {saldo > 0 && centavos !== null && centavos > saldo && <p className="atencion-item atencion" style={{ display: "block" }}>Es más de lo que {tipo === 'cobro' ? 'debe' : 'le debemos'}: quedan {formatPesos(centavos - saldo)} a favor.</p>}
          {saldo > 0 && <button type="button" className="boton secundario" style={{ justifySelf: 'start' }} onClick={() => setMonto(String(saldo / 100).replace('.', ','))}>Todo el saldo: {formatPesos(saldo)}</button>}
        </>
      ),
      listo: centavos === null || centavos <= 0 ? 'Ingresá el monto' : true,
    } as Paso]),
    ...(medio === 'endoso' ? [{
      titulo: '¿Qué cheque le das?',
      ayuda: 'Cheques que te pagaron los clientes y todavía están en cartera. Se paga por el monto completo del cheque.',
      contenido: cartera.length ? (
        <Opciones valor={endosoDe} onChange={setEndosoDe} opciones={cartera.map((c) => ({
          valor: c.id, titulo: `${formatPesos(c.monto)} · ${c.banco ?? ''} n.º ${c.chequeNumero ?? ''}`, detalle: `De ${c.contraparte}${c.chequeFechaCobro ? ` · se cobra el ${verFecha(c.chequeFechaCobro)}` : ''}`,
        }))} />
      ) : <p className="tenue">No hay cheques de terceros en cartera.</p>,
      listo: endosoDe ? true : 'Elegí el cheque',
    } as Paso] : []),
    ...(medio && medio !== 'efectivo' && medio !== 'endoso' ? [{
      titulo: esCheque ? 'Datos del cheque' : 'Datos de la operación',
      ayuda: esCheque ? 'Banco, número y fecha en que se puede cobrar. Así aparece en la lista de cheques por fecha.' : 'Opcional: banco y número de operación, para encontrarlo después en el resumen.',
      contenido: (
        <>
          {medio !== 'mercado_pago' && <Campo etiqueta="Banco"><Opciones columnas valor={bancoId} onChange={setBancoId} opciones={(bancos ?? []).filter((b) => b.activo).map((b) => ({ valor: b.id, titulo: b.nombre }))} /></Campo>}
          {esCheque && <Campo etiqueta="Número de cheque"><Entrada value={nro} onChange={(e) => setNro(e.target.value)} inputMode="numeric" /></Campo>}
          {esCheque && <Campo etiqueta="Fecha de cobro"><Entrada type="date" value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} /></Campo>}
          {!esCheque && <Campo etiqueta="Número de operación" ayuda="Opcional"><Entrada value={referencia} onChange={(e) => setReferencia(e.target.value)} /></Campo>}
        </>
      ),
      listo: esCheque && !bancoId ? 'Elegí el banco' : medio === 'cheque' && (!nro || !fechaCobro) ? 'Completá número y fecha de cobro' : true,
    } as Paso] : []),
    {
      titulo: 'Revisá y guardá',
      ayuda: `Al guardar se descuenta de la cuenta de ${quien?.nombre ?? ''}.`,
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>{tipo === 'cobro' ? 'Cliente' : 'Proveedor'}</dt><dd>{quien?.nombre}</dd>
            <dt>Medio</dt><dd>{medio && LABEL_MEDIO[medio]}{endosado ? ` · ${endosado.banco ?? ''} n.º ${endosado.chequeNumero ?? ''}, de ${endosado.contraparte}` : ''}{medio !== 'endoso' && bancoId ? ` · ${bancos?.find((b) => b.id === bancoId)?.nombre}` : ''}{nro ? ` n.º ${nro}` : ''}{fechaCobro ? `, cobro ${verFecha(fechaCobro)}` : ''}</dd>
            {centavos !== null && saldo > 0 && <><dt>Después</dt><dd>{saldo - centavos > 0 ? `${tipo === 'cobro' ? 'Sigue debiendo' : 'Le seguimos debiendo'} ${formatPesos(saldo - centavos)}` : saldo === centavos ? 'Queda al día' : `Queda ${formatPesos(centavos - saldo)} a favor ${tipo === 'cobro' ? 'del cliente' : 'nuestro'}`}</dd></>}
          </dl>
          <div className="lectura"><span>{tipo === 'cobro' ? 'Cobrado' : 'Pagado'}</span><span className="cifra">{centavos !== null && formatPesos(centavos)}</span></div>
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
      await api('/dinero', {
        method: 'POST',
        body: {
          tipo, clienteId: tipo === 'cobro' ? quien!.id : null, proveedorId: tipo === 'pago' ? quien!.id : null, fecha, monto: centavos, medio,
          bancoId: medio === 'efectivo' || medio === 'mercado_pago' || medio === 'endoso' ? null : bancoId, endosoDe: medio === 'endoso' ? endosoDe : null, chequeNumero: esCheque ? nro || undefined : undefined,
          chequeFechaCobro: esCheque && fechaCobro ? fechaCobro : null, referencia: referencia || undefined, notas: notas || undefined,
        },
      });
      await qc.invalidateQueries();
      navegar(`/cuentas/${de}/${quien!.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return <Asistente proceso={`dinero-${tipo}`} pasos={pasos} onTerminar={guardar} textoTerminar={tipo === 'cobro' ? 'Guardar cobro' : 'Guardar pago'} guardando={guardando} error={error} onCancelar={() => navegar(-1)} />;
}
