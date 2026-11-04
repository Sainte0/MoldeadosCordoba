import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Scale, ShoppingCart } from 'lucide-react';
import { aMili, estadoStock, formatCantidad, LABEL_TIPO_MP, ORDEN_NIVEL, TIPOS_MP, type TipoMp, type Unidad } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verMomento } from '../api';
import { useMaterias, type MateriaPrima } from '../datos';
import { Estado } from '../Estado';
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puede('compras', 2) && <Link to="/compras/nueva" className="boton primario"><ShoppingCart size={18} aria-hidden /> Cargar compra</Link>}
          {puede('compras', 2) && <Link to="/pesaje" className="boton secundario"><Scale size={18} aria-hidden /> Pesaje de cartón</Link>}
          {puede('materias', 3) && <button className="boton fantasma" onClick={() => setEditando({ tipo: 'tinta', unidad: 'l', activo: true, stockMinimo: 0 })}><Plus size={18} aria-hidden /> Nueva materia prima</button>}
        </div>
      </Cabecera>
      {isLoading ? <Cargando /> : (
        <div className="hoja filas">
          {data?.map((m) => ({ m, e: estadoStock(m) }))
            .sort((x, y) => Number(!x.m.activo) - Number(!y.m.activo) || ORDEN_NIVEL[x.e.nivel] - ORDEN_NIVEL[y.e.nivel] || x.m.nombre.localeCompare(y.m.nombre))
            .map(({ m, e }) => (
              <button key={m.id} className="fila" onClick={() => setViendo(m)} style={{ opacity: m.activo ? 1 : 0.55 }}>
                <div>
                  <div className="principal">{m.nombre}</div>
                  <div className="chico tenue">{m.activo ? e.detalle : 'Desactivada'}</div>
                </div>
                <div className="derecha">
                  <div className="cifra" style={{ fontSize: '1.3rem' }}>{formatCantidad(e.stockVisible, m.unidad)}</div>
                  {m.activo && <Estado nivel={e.nivel}>{e.titulo}</Estado>}
                </div>
              </button>
            ))}
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
      <div className="lectura"><span>En stock</span><span className="cifra">{formatCantidad(Math.max(0, m.stock), m.unidad)}</span></div>
      {estadoStock(m).nivel !== 'ok' && <div className={`atencion-item ${estadoStock(m).nivel}`} style={{ gridTemplateColumns: '1fr' }}><div><b>{estadoStock(m).titulo}</b><small>{estadoStock(m).detalle}</small></div></div>}
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
              <div className="principal">{MOTIVO[mv.motivo] ?? mv.motivo}{mv.compraId && <> · <Link to={`/compras/${mv.compraNumero}`}>{nroTicket(mv.compraNumero ?? 0)}</Link></>}</div>
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
  const [diasAviso, setDiasAviso] = useState(String(inicial.diasAviso ?? 7));
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const min = minimo.trim() === '' ? 0 : aMili(minimo);
    if (min === null || min < 0) return setError('El stock mínimo no es válido');
    setError(null);
    try {
      const body = { nombre, tipo, unidad, color: tipo === 'tinta' ? color || undefined : undefined, stockMinimo: min, diasAviso: Number(diasAviso || 0), activo };
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
      <Campo etiqueta="Avisar cuando alcance para" ayuda="Según lo que se usó en los últimos 30 días. 0 = no avisar.">
        <EntradaNumero unidad="días" value={diasAviso} onChange={(e) => setDiasAviso(e.target.value.replace(/\D/g, ''))} />
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
