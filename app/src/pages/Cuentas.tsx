import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import { formatPesos, LABEL_MEDIO, type Medio } from '@moldeados/shared';
import { api, useSesion, verFecha } from '../api';
import { useBancos, type Banco } from '../datos';
import { Aviso, Buscador, Cabecera, Campo, Cargando, Dialogo, Entrada, Opciones } from '../ui';

interface Saldo { id: string; nombre: string; debe: number; haber: number; ultimoMovimiento: string | null }
interface Cheque { id: string; tipo: 'cobro' | 'pago'; medio: Medio; monto: number; chequeNumero: string | null; chequeFechaCobro: string; banco: string; contraparte: string }

export function Cuentas() {
  const { puede } = useSesion();
  const [de, setDe] = useState<'cliente' | 'proveedor'>('cliente');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['cuentas', de], queryFn: () => api<Saldo[]>(`/cuentas/${de}`) });
  const { data: cheques } = useQuery({ queryKey: ['cheques'], queryFn: () => api<Cheque[]>('/cheques') });
  const filas = (data ?? []).filter((s) => !q || s.nombre.toLowerCase().includes(q.toLowerCase())).map((s) => ({ ...s, saldo: s.debe - s.haber }));
  const total = filas.reduce((a, s) => a + s.saldo, 0);

  return (
    <div className="ancho" style={{ display: 'grid', gap: 24 }}>
      <Cabecera titulo="Cuentas corrientes" bajada="Lo que nos deben los clientes y lo que les debemos a los proveedores.">
        {puede('cuentas', 2) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/dinero/nuevo?tipo=cobro" className="boton primario"><ArrowDownLeft size={18} aria-hidden /> Registrar cobro</Link>
            <Link to="/dinero/nuevo?tipo=pago" className="boton secundario"><ArrowUpRight size={18} aria-hidden /> Registrar pago</Link>
          </div>
        )}
      </Cabecera>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="pestanas" role="group" aria-label="Cuentas de">
          <button aria-pressed={de === 'cliente'} onClick={() => setDe('cliente')}>Clientes</button>
          <button aria-pressed={de === 'proveedor'} onClick={() => setDe('proveedor')}>Proveedores</button>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}><Buscador placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cuenta" /></div>
      </div>

      <div className="cifras">
        <div><span className={`cifra ${total > 0 ? 'saldo-mas' : ''}`}>{formatPesos(total)}</span><small>{de === 'cliente' ? 'nos deben en total' : 'debemos en total'}</small></div>
        <div><span className="cifra">{filas.filter((s) => s.saldo > 0).length}</span><small>{de === 'cliente' ? 'clientes con deuda' : 'proveedores a pagar'}</small></div>
      </div>

      {isLoading ? <Cargando /> : (
        <div className="hoja filas">
          {filas.sort((a, b) => b.saldo - a.saldo).map((s) => (
            <Link key={s.id} to={`/cuentas/${de}/${s.id}`} className="fila">
              <div><div className="principal">{s.nombre}</div><div className="chico tenue">{s.ultimoMovimiento ? `Última ${de === 'cliente' ? 'venta' : 'compra'} ${verFecha(s.ultimoMovimiento)}` : 'Sin movimientos'}</div></div>
              <div className="derecha">
                <div className={`cifra ${s.saldo > 0 ? 'saldo-mas' : s.saldo === 0 ? 'saldo-cero' : ''}`}>{formatPesos(Math.abs(s.saldo))}</div>
                <div className="chico tenue">{s.saldo > 0 ? (de === 'cliente' ? 'nos debe' : 'le debemos') : s.saldo < 0 ? 'a favor' : 'al día'}</div>
              </div>
            </Link>
          ))}
          {!filas.length && <p className="tenue" style={{ padding: 16 }}>No hay cuentas para mostrar.</p>}
        </div>
      )}

      {cheques && cheques.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Cheques por cobrar y por cubrir</h3><span className="chico tenue">por fecha de cobro</span></div>
          {cheques.map((c) => (
            <div className="fila" key={c.id}>
              <div>
                <div className="principal">{verFecha(c.chequeFechaCobro)} · {c.contraparte}</div>
                <div className="chico tenue">{LABEL_MEDIO[c.medio]} {c.banco}{c.chequeNumero ? ` n.º ${c.chequeNumero}` : ''} · {c.tipo === 'cobro' ? 'recibido' : 'emitido'}</div>
              </div>
              <span className={`cifra ${c.tipo === 'pago' ? 'saldo-mas' : ''}`}>{formatPesos(c.monto)}</span>
            </div>
          ))}
        </section>
      )}

      {puede('cuentas', 1) && <Bancos />}
    </div>
  );
}

function Bancos() {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data } = useBancos();
  const [editando, setEditando] = useState<Partial<Banco> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    if (!editando) return;
    try {
      await api(editando.id ? `/bancos/${editando.id}` : '/bancos', { method: editando.id ? 'PUT' : 'POST', body: { nombre: editando.nombre ?? '', activo: editando.activo ?? true } });
      await qc.invalidateQueries({ queryKey: ['bancos'] });
      setEditando(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };
  return (
    <section>
      <Cabecera titulo="Bancos" bajada="Los que aparecen al registrar un e-cheq, un cheque o una transferencia.">
        {puede('cuentas', 3) && <button className="boton secundario" onClick={() => setEditando({ activo: true })}><Plus size={18} aria-hidden /> Agregar banco</button>}
      </Cabecera>
      <div className="hoja filas">
        {data?.map((b) => (
          <button key={b.id} className="fila" disabled={!puede('cuentas', 3)} onClick={() => setEditando(b)} style={{ opacity: b.activo ? 1 : 0.55 }}>
            <span className="principal">{b.nombre}</span><span className="chico tenue">{b.activo ? '' : 'No se usa'}</span>
          </button>
        ))}
      </div>
      {editando && (
        <Dialogo titulo={editando.id ? editando.nombre ?? '' : 'Agregar banco'} onCerrar={() => setEditando(null)}>
          <Campo etiqueta="Nombre"><Entrada value={editando.nombre ?? ''} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus /></Campo>
          {editando.id && <Opciones columnas valor={editando.activo ?? true} onChange={(activo) => setEditando({ ...editando, activo })} opciones={[{ valor: true, titulo: 'Se usa' }, { valor: false, titulo: 'No se usa' }]} />}
          <Aviso>{error}</Aviso>
          <div className="acciones"><button className="boton secundario" onClick={() => setEditando(null)}>Cancelar</button><button className="boton primario" onClick={guardar}>Guardar</button></div>
        </Dialogo>
      )}
    </section>
  );
}
