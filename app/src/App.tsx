import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BellRing, CircleHelp, Home, LogOut, Menu, Search, X } from 'lucide-react';
import { AJUSTES, AREAS, enArea, type Area } from './navegacion';
import { Reloj } from './Reloj';
import { ColaPendiente } from './ColaPendiente';
import { useCola } from './cola';
import { Dialogo } from './ui';
import { precargar } from './persistencia';
import { useQueryClient } from '@tanstack/react-query';
import { LABEL_ROL, type Modulo } from '@moldeados/shared/base';
import { useSesion } from './api';
import { Login } from './pages/Login';
import { Campana } from './Campana';
import { useAvisosEnVivo, type AvisoVivo } from './vivo';
import { desactivarPush, reafirmarPush } from './push';
import { Inicio } from './pages/Inicio';

// El buscador (con el texto de todas las guías) se baja recién la primera vez que se abre.
const BuscadorGlobal = lazy(() => import('./BuscadorGlobal').then((m) => ({ default: m.BuscadorGlobal })));
// Cada pantalla baja su código recién cuando se abre: el primer ingreso (login + inicio) queda liviano.
const Pesaje = lazy(() => import('./pages/Pesaje').then((m) => ({ default: m.Pesaje })));
const NuevaCompra = lazy(() => import('./pages/NuevaCompra').then((m) => ({ default: m.NuevaCompra })));
const Compras = lazy(() => import('./pages/Compras').then((m) => ({ default: m.Compras })));
const CompraDetalle = lazy(() => import('./pages/CompraDetalle').then((m) => ({ default: m.CompraDetalle })));
const Proveedores = lazy(() => import('./pages/Proveedores').then((m) => ({ default: m.Proveedores })));
const Materias = lazy(() => import('./pages/Materias').then((m) => ({ default: m.Materias })));
const Equipo = lazy(() => import('./pages/Equipo').then((m) => ({ default: m.Equipo })));
const Registro = lazy(() => import('./pages/Registro').then((m) => ({ default: m.Registro })));
const Produccion = lazy(() => import('./pages/Produccion').then((m) => ({ default: m.Produccion })));
const NuevoParte = lazy(() => import('./pages/NuevoParte').then((m) => ({ default: m.NuevoParte })));
const ParteDetalle = lazy(() => import('./pages/ParteDetalle').then((m) => ({ default: m.ParteDetalle })));
const Palets = lazy(() => import('./pages/Palets').then((m) => ({ default: m.Palets })));
const NuevoPalet = lazy(() => import('./pages/NuevoPalet').then((m) => ({ default: m.NuevoPalet })));
const PaletDetalle = lazy(() => import('./pages/PaletDetalle').then((m) => ({ default: m.PaletDetalle })));
const Maples = lazy(() => import('./pages/Maples').then((m) => ({ default: m.Maples })));
const Despacho = lazy(() => import('./pages/Despacho').then((m) => ({ default: m.Despacho })));
const Ventas = lazy(() => import('./pages/Ventas').then((m) => ({ default: m.Ventas })));
const VentaDetalle = lazy(() => import('./pages/VentaDetalle').then((m) => ({ default: m.VentaDetalle })));
const Clientes = lazy(() => import('./pages/Clientes').then((m) => ({ default: m.Clientes })));
const Precios = lazy(() => import('./pages/Precios').then((m) => ({ default: m.Precios })));
const Cuentas = lazy(() => import('./pages/Cuentas').then((m) => ({ default: m.Cuentas })));
const CuentaDetalle = lazy(() => import('./pages/CuentaDetalle').then((m) => ({ default: m.CuentaDetalle })));
const NuevoMovimiento = lazy(() => import('./pages/NuevoMovimiento').then((m) => ({ default: m.NuevoMovimiento })));
const Tablero = lazy(() => import('./pages/Tablero').then((m) => ({ default: m.Tablero })));
const Gastos = lazy(() => import('./pages/Gastos').then((m) => ({ default: m.Gastos })));
const NuevoGasto = lazy(() => import('./pages/NuevoGasto').then((m) => ({ default: m.NuevoGasto })));
const Caja = lazy(() => import('./pages/Caja').then((m) => ({ default: m.Caja })));
const Ayuda = lazy(() => import('./pages/Ayuda').then((m) => ({ default: m.Ayuda })));
const Pedidos = lazy(() => import('./pages/Pedidos').then((m) => ({ default: m.Pedidos })));
const NuevoPedido = lazy(() => import('./pages/Pedidos').then((m) => ({ default: m.NuevoPedido })));
const PedidoDetalleVista = lazy(() => import('./pages/Pedidos').then((m) => ({ default: m.PedidoDetalleVista })));
const Importar = lazy(() => import('./pages/Importar').then((m) => ({ default: m.Importar })));
const Agenda = lazy(() => import('./pages/Agenda').then((m) => ({ default: m.Agenda })));
const NuevoRecordatorio = lazy(() => import('./pages/Agenda').then((m) => ({ default: m.NuevoRecordatorio })));
const Exportar = lazy(() => import('./pages/Exportar').then((m) => ({ default: m.Exportar })));

function Marca() {
  return (
    <div className="marca">
      <img src="/logo.webp" width={34} height={33} alt="" style={{ borderRadius: 7 }} />
      <div><b>Moldeados Córdoba</b><small>Planta y administración</small></div>
    </div>
  );
}

export function App() {
  const { sesion, salir, puede } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const pendientes = useCola().filter((x) => !x.error && x.usuarioId === sesion?.usuario.id).length;
  const qc = useQueryClient();
  // Al entrar (y al recuperar la señal): dejar guardado lo necesario para cargar sin conexión.
  useEffect(() => {
    if (!sesion) return;
    // Un poco después de entrar: que primero cargue lo que se ve en pantalla.
    const ya = () => precargar(qc, puede);
    const t = setTimeout(ya, 1500);
    window.addEventListener('online', ya);
    return () => { clearTimeout(t); window.removeEventListener('online', ya); };
  }, [sesion?.usuario.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘K / Ctrl+K abren el buscador desde cualquier pantalla (y "/" si no se está escribiendo en un campo).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !escribiendo)) { e.preventDefault(); setBuscando(true); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  const { pathname } = useLocation();
  useEffect(() => setAbierto(false), [pathname]);
  const ir = useNavigate();

  // Avisos en vivo: cada aviso nuevo actualiza la campana y la agenda, y asoma abajo unos segundos.
  const [asoma, setAsoma] = useState<AvisoVivo | null>(null);
  useAvisosEnVivo(!!sesion, (a) => {
    void qc.invalidateQueries({ queryKey: ['notificaciones'] });
    void qc.invalidateQueries({ queryKey: ['agenda'] });
    if (a.tipo === 'pedido') void qc.invalidateQueries({ queryKey: ['pedidos'] });
    setAsoma(a);
  }, () => void qc.invalidateQueries({ queryKey: ['notificaciones'] }));
  useEffect(() => {
    if (!asoma) return;
    const t = setTimeout(() => setAsoma(null), 7000);
    return () => clearTimeout(t);
  }, [asoma]);
  useEffect(() => { if (sesion) void reafirmarPush().catch(() => {}); }, [sesion?.usuario.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const cerrarSesion = () => { void desactivarPush().finally(salir); };

  if (!sesion) return <Login />;
  const p = (m: Modulo, n: 1 | 2 | 3 = 1) => puede(m, n);

  return (
    <div className="marco">
      <div className="barra-movil">
        <Marca />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Reloj />
          <Campana alAbrir={() => setAsoma(null)} />
          <button className="boton icono" onClick={() => setBuscando(true)} aria-label="Buscar"><Search size={22} /></button>
          {pathname !== '/ayuda' && <NavLink className="boton icono" to={`/ayuda?desde=${encodeURIComponent(pathname)}`} aria-label="Ayuda"><CircleHelp size={24} /></NavLink>}
          <button className="boton icono" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu size={26} /></button>
        </div>
      </div>
      <nav className={`lateral${abierto ? ' abierto' : ''}`} aria-label="Secciones">
        <div className="cabeza-lateral">
          <Marca />
          {abierto ? <button className="boton icono" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X size={24} /></button> : <span className="solo-escritorio"><Campana alAbrir={() => setAsoma(null)} /></span>}
        </div>
        <button className="abrir-buscador" onClick={() => { setAbierto(false); setBuscando(true); }}>
          <Search size={18} aria-hidden /> <span>Buscar</span> <kbd>{/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' activo' : ''}`}><Home size={20} aria-hidden /> Inicio</NavLink>
        {[...AREAS, AJUSTES].map((area) => {
          const visibles = area.pestanas.filter((x) => p(x.modulo));
          if (!visibles.length) return null;
          return (
            <NavLink key={area.texto} to={visibles[0]!.a} className={`nav-link${enArea(area, pathname) ? ' activo' : ''}${area === AJUSTES ? ' nav-ajustes' : ''}`}>
              <area.icono size={20} aria-hidden /> {area.texto}
            </NavLink>
          );
        })}
        <NavLink to={`/ayuda?desde=${encodeURIComponent(pathname === '/ayuda' ? '' : pathname)}`} className={() => `nav-link${pathname === '/ayuda' ? ' activo' : ''}`}><CircleHelp size={20} aria-hidden /> Ayuda</NavLink>
        <div className="nav-pie">
          <Reloj conFecha />
          <div>{sesion.usuario.nombre}</div>
          <div>{LABEL_ROL[sesion.usuario.rol]}</div>
          <button onClick={() => (pendientes ? setConfirmarSalir(true) : cerrarSesion())}><LogOut size={16} aria-hidden /> Salir</button>
        </div>
      </nav>
      {buscando && <Suspense fallback={null}><BuscadorGlobal abierto onCerrar={() => setBuscando(false)} /></Suspense>}
      {confirmarSalir && (
        <Dialogo titulo="Tenés cargas sin subir" onCerrar={() => setConfirmarSalir(false)}>
          <p>{pendientes === 1 ? 'Hay 1 carga' : `Hay ${pendientes} cargas`} guardadas en este teléfono que todavía no se subieron. Si salís, quedan guardadas y se suben la próxima vez que entres vos.</p>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setConfirmarSalir(false)}>Quedarme</button>
            <button className="boton primario" onClick={() => { setConfirmarSalir(false); cerrarSesion(); }}>Salir igual</button>
          </div>
        </Dialogo>
      )}
      {asoma && (
        <button className="toast" role="status" onClick={() => { setAsoma(null); if (asoma.ruta) ir(asoma.ruta); }}>
          <BellRing size={22} aria-hidden />
          <span><b>{asoma.titulo}</b>{asoma.detalle && <small>{asoma.detalle}</small>}</span>
          <X size={18} aria-hidden />
        </button>
      )}
      <main className="contenido">
        <ColaPendiente />
        <Pestanas path={pathname} puede={p} />
        <Suspense fallback={<p className="tenue" role="status">Cargando…</p>}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          {p('compras', 2) && <Route path="/pesaje" element={<Pesaje />} />}
          {p('compras', 2) && <Route path="/compras/nueva" element={<NuevaCompra />} />}
          {p('compras') && <Route path="/compras" element={<Compras />} />}
          {p('compras') && <Route path="/compras/:id" element={<CompraDetalle />} />}
          {p('tablero') && <Route path="/tablero" element={<Tablero />} />}
          {p('gastos') && <Route path="/gastos" element={<Gastos />} />}
          {p('gastos', 2) && <Route path="/gastos/nuevo" element={<NuevoGasto />} />}
          {p('gastos') && <Route path="/caja" element={<Caja />} />}
          {p('ventas', 2) && <Route path="/ventas/nueva" element={<Despacho />} />}
          {p('ventas') && <Route path="/ventas" element={<Ventas />} />}
          {p('ventas') && <Route path="/pedidos" element={<Pedidos />} />}
          {p('ventas', 2) && <Route path="/pedidos/nuevo" element={<NuevoPedido />} />}
          {p('ventas') && <Route path="/pedidos/:id" element={<PedidoDetalleVista />} />}
          {p('ventas') && <Route path="/ventas/:id" element={<VentaDetalle />} />}
          {p('ventas') && <Route path="/clientes" element={<Clientes />} />}
          {p('ventas') && <Route path="/precios" element={<Precios />} />}
          {p('cuentas') && <Route path="/cuentas" element={<Cuentas />} />}
          {p('cuentas') && <Route path="/cuentas/:de/:id" element={<CuentaDetalle />} />}
          {p('cuentas', 2) && <Route path="/dinero/nuevo" element={<NuevoMovimiento />} />}
          {p('produccion') && <Route path="/produccion" element={<Produccion />} />}
          {p('produccion', 2) && <Route path="/produccion/nuevo" element={<NuevoParte />} />}
          {p('produccion') && <Route path="/produccion/:id" element={<ParteDetalle />} />}
          {p('produccion') && <Route path="/palets" element={<Palets />} />}
          {p('produccion', 2) && <Route path="/palets/nuevo" element={<NuevoPalet />} />}
          {/* El QR del palet: cualquiera con usuario lo abre; lo que ve depende de sus permisos. */}
          <Route path="/palets/:id" element={<PaletDetalle />} />
          {p('productos') && <Route path="/maples" element={<Maples />} />}
          {p('materias') && <Route path="/materia-prima" element={<Materias />} />}
          {p('proveedores') && <Route path="/proveedores" element={<Proveedores />} />}
          {p('usuarios') && <Route path="/equipo" element={<Equipo />} />}
          {p('auditoria') && <Route path="/registro" element={<Registro />} />}
          <Route path="/ayuda" element={<Ayuda />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/agenda/nuevo" element={<NuevoRecordatorio />} />
          <Route path="/agenda/:id" element={<NuevoRecordatorio />} />
          {p('tablero') && <Route path="/exportar" element={<Exportar />} />}
          {p('tablero') && <Route path="/importar" element={<Importar />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}

/** Pestañas del área, solo en las pantallas de listado (en los asistentes y detalles no distraen). */
function Pestanas({ path, puede }: { path: string; puede: (m: Modulo) => boolean }) {
  const area = [...AREAS, AJUSTES].find((x) => x.pestanas.some((t) => t.a === path));
  const visibles = area?.pestanas.filter((t) => puede(t.modulo)) ?? [];
  if (visibles.length < 2) return null;
  return (
    <nav className="pestanas subnav" aria-label={area!.texto}>
      {visibles.map((t) => <NavLink key={t.a} to={t.a} className={({ isActive }) => (isActive ? 'activa' : '')}>{t.texto}</NavLink>)}
    </nav>
  );
}
