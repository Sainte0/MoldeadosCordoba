import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { aMili, formatCantidad, LABEL_TIPO_MP, TIPOS_MP, type TipoMp, type Unidad } from '@moldeados/shared';
import { api, nroTicket, useSesion, verMomento } from '../api';
import { useMaterias, type MateriaPrima } from '../datos';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones } from '../ui';

const MOTIVO: Record<string, string> = { compra: 'Compra', anulacion_compra: 'Compra anulada', ajuste: 'Corrección', consumo: 'Producción', anulacion_consumo: 'Producción anulada' };

export function Materias() {
  const { puede } = useSesion();
  const { data, isLoading } = useMaterias();
  const [editando, setEditando] = useState<Partial<MateriaPrima> | null>(null);
  const [viendo, setViendo] = useState<MateriaPrima | null>(null);

  return (
    <div className="ancho">
      <Cabecera titulo="Materia prima" bajada="Lo que hay en planta. Sube con cada compra y baja con la producción.">
        {puede('materias', 3) && <button className="boton primario" onClick={() => setEditando({ tipo: 'tinta', unidad: 'l', activo: true, stockMinimo: 0 })}><Plus size={18} aria-hidden /> Agregar</button>}
      </Cabecera>
      {isLoading ? <Cargando /> : (
        <div className="hoja filas">
          {data?.map((m) => {
            const bajo = m.stockMinimo > 0 && m.stock < m.stockMinimo;
            return (
              <button key={m.id} className="fila" onClick={() => setViendo(m)} style={{ opacity: m.activo ? 1 : 0.55 }}>
                <div>
                  <div className="principal">{m.nombre}</div>
                  <div className="chico tenue">{LABEL_TIPO_MP[m.tipo]}{m.color ? ` · ${m.color}` : ''}{!m.activo ? ' · Desactivada' : ''}</div>
                </div>
                <div className="derecha">
                  <div className="cifra" style={{ fontSize: '1.3rem', color: bajo ? 'var(--peligro)' : undefined }}>{formatCantidad(m.stock, m.unidad)}</div>
                  {bajo && <span className="marca-texto alerta">Bajo mínimo</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {viendo && <FichaMateria m={viendo} onCerrar={() => setViendo(null)} onEditar={() => { setEditando(viendo); setViendo(null); }} />}
      {editando && <EditarMateria inicial={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

interface Movimiento { id: string; cantidad: number; motivo: string; nota: string | null; fecha: string; usuario: string; compraNumero: number | null; compraId: string | null }

function FichaMateria({ m, onCerrar, onEditar }: { m: MateriaPrima; onCerrar: () => void; onEditar: () => void }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: movs } = useQuery({ queryKey: ['movimientos', m.id], queryFn: () => api<Movimiento[]>(`/materias/${m.id}/movimientos`) });
  const [sentido, setSentido] = useState<1 | -1 | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const u = m.unidad === 'kg' ? 'kg' : 'L';

  const corregir = async () => {
    const c = aMili(cantidad);
    if (!sentido || c === null || c <= 0) return setError('Ingresá cuánto sumar o restar');
    setError(null);
    try {
      await api(`/materias/${m.id}/ajuste`, { method: 'POST', body: { cantidad: sentido * c, nota } });
      await qc.invalidateQueries();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo corregir');
    }
  };

  return (
    <Dialogo titulo={m.nombre} onCerrar={onCerrar}>
      <div className="lectura"><span>En stock</span><span className="cifra">{formatCantidad(m.stock, m.unidad)}</span></div>
      {puede('materias', 3) && (
        <details className="hoja relleno">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Corregir stock</summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <p className="chico tenue">Para cuando el conteo físico no coincide. Queda registrado con tu nombre y el motivo.</p>
            <Opciones columnas valor={sentido} onChange={setSentido} opciones={[{ valor: 1, titulo: 'Sumar' }, { valor: -1, titulo: 'Restar' }]} />
            <EntradaNumero unidad={u} value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad" />
            <Campo etiqueta="Motivo"><Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: conteo del viernes" /></Campo>
            <Aviso>{error}</Aviso>
            <button className="boton primario" onClick={corregir}>Guardar corrección</button>
          </div>
        </details>
      )}
      <h3>Movimientos</h3>
      <div className="hoja filas">
        {!movs?.length && <p className="tenue" style={{ padding: 16 }}>Sin movimientos todavía.</p>}
        {movs?.map((mv) => (
          <div className="fila" key={mv.id}>
            <div>
              <div className="principal">{MOTIVO[mv.motivo] ?? mv.motivo}{mv.compraId && <> · <Link to={`/compras/${mv.compraId}`}>{nroTicket(mv.compraNumero ?? 0)}</Link></>}</div>
              <div className="chico tenue">{verMomento(mv.fecha)} · {mv.usuario}{mv.nota ? ` · ${mv.nota}` : ''}</div>
            </div>
            <span className="cifra" style={{ color: mv.cantidad < 0 ? 'var(--peligro)' : 'var(--accion)' }}>{mv.cantidad > 0 ? '+' : ''}{formatCantidad(mv.cantidad, m.unidad)}</span>
          </div>
        ))}
      </div>
      <div className="acciones">
        {puede('materias', 3) && <button className="boton secundario" onClick={onEditar}>Editar datos</button>}
        <button className="boton primario" onClick={onCerrar}>Listo</button>
      </div>
    </Dialogo>
  );
}

function EditarMateria({ inicial, onCerrar }: { inicial: Partial<MateriaPrima>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [tipo, setTipo] = useState<TipoMp>(inicial.tipo ?? 'tinta');
  const [unidad, setUnidad] = useState<Unidad>(inicial.unidad ?? 'l');
  const [color, setColor] = useState(inicial.color ?? '');
  const [minimo, setMinimo] = useState(inicial.stockMinimo ? String(inicial.stockMinimo / 1000).replace('.', ',') : '');
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const min = minimo.trim() === '' ? 0 : aMili(minimo);
    if (min === null || min < 0) return setError('El stock mínimo no es válido');
    setError(null);
    try {
      const body = { nombre, tipo, unidad, color: tipo === 'tinta' ? color || undefined : undefined, stockMinimo: min, activo };
      await api(inicial.id ? `/materias/${inicial.id}` : '/materias', { method: inicial.id ? 'PUT' : 'POST', body });
      await qc.invalidateQueries({ queryKey: ['materias'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <Dialogo titulo={inicial.id ? `Editar ${inicial.nombre}` : 'Nueva materia prima'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre" ayuda="Ej.: Tinta azul, Cartón de supermercado"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Campo>
      <Campo etiqueta="Tipo">
        <Opciones columnas valor={tipo} onChange={(t) => { setTipo(t); setUnidad(t === 'carton' ? 'kg' : 'l'); }} opciones={TIPOS_MP.map((t) => ({ valor: t, titulo: LABEL_TIPO_MP[t] }))} />
      </Campo>
      {tipo === 'otro' && <Campo etiqueta="Se mide en"><Opciones columnas valor={unidad} onChange={setUnidad} opciones={[{ valor: 'kg', titulo: 'Kilos' }, { valor: 'l', titulo: 'Litros' }]} /></Campo>}
      {tipo === 'tinta' && <Campo etiqueta="Color"><Entrada value={color} onChange={(e) => setColor(e.target.value)} placeholder="Rojo" /></Campo>}
      <Campo etiqueta="Stock mínimo" ayuda="Debajo de esto se marca como bajo en el inicio. Vacío = sin aviso.">
        <EntradaNumero unidad={unidad === 'kg' ? 'kg' : 'L'} value={minimo} onChange={(e) => setMinimo(e.target.value)} />
      </Campo>
      {inicial.id && <Opciones columnas valor={activo} onChange={setActivo} opciones={[{ valor: true, titulo: 'Activa' }, { valor: false, titulo: 'Desactivada', detalle: 'No aparece para comprar' }]} />}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>{inicial.id ? 'Guardar cambios' : 'Agregar'}</button>
      </div>
    </Dialogo>
  );
}
