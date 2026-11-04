import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ChartColumn, Factory, Home, LogOut, Menu, Receipt, Settings, ShoppingCart, Wallet, X } from 'lucide-react';
import { LABEL_ROL, type Modulo } from '@moldeados/shared';
import { useSesion } from './api';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Pesaje } from './pages/Pesaje';
import { NuevaCompra } from './pages/NuevaCompra';
import { Compras } from './pages/Compras';
import { CompraDetalle } from './pages/CompraDetalle';
import { Proveedores } from './pages/Proveedores';
import { Materias } from './pages/Materias';
import { Equipo } from './pages/Equipo';
import { Registro } from './pages/Registro';
import { Produccion } from './pages/Produccion';
import { NuevoParte } from './pages/NuevoParte';
import { ParteDetalle } from './pages/ParteDetalle';
import { Palets } from './pages/Palets';
import { NuevoPalet } from './pages/NuevoPalet';
import { PaletDetalle } from './pages/PaletDetalle';
import { Maples } from './pages/Maples';
import { Despacho } from './pages/Despacho';
import { Ventas } from './pages/Ventas';
import { VentaDetalle } from './pages/VentaDetalle';
import { Clientes } from './pages/Clientes';
import { Precios } from './pages/Precios';
import { Cuentas } from './pages/Cuentas';
import { CuentaDetalle } from './pages/CuentaDetalle';
import { NuevoMovimiento } from './pages/NuevoMovimiento';
import { Tablero } from './pages/Tablero';
import { Gastos } from './pages/Gastos';
import { NuevoGasto } from './pages/NuevoGasto';
import { Caja } from './pages/Caja';

// Pocas áreas, siempre las mismas: lo de adentro va en pestañas. Una función nueva entra en un área existente,
// nunca como un ítem nuevo del menú (pedido del cliente: ultra simple).
interface Pestana { a: string; texto: string; modulo: Modulo }
interface Area { texto: string; icono: typeof Home; pestanas: Pestana[]; /** rutas que también pertenecen al área */ tambien?: string[] }
const AREAS: Area[] = [
  { texto: 'Planta', icono: Factory, pestanas: [
    { a: '/produccion', texto: 'Producción', modulo: 'produccion' },
    { a: '/palets', texto: 'Stock y palets', modulo: 'produccion' },
    { a: '/materia-prima', texto: 'Materia prima', modulo: 'materias' },
  ] },
  { texto: 'Ventas', icono: Receipt, pestanas: [
    { a: '/ventas', texto: 'Despachos', modulo: 'ventas' },
    { a: '/clientes', texto: 'Clientes', modulo: 'ventas' },
    { a: '/precios', texto: 'Precios', modulo: 'ventas' },
  ] },
  { texto: 'Compras', icono: ShoppingCart, tambien: ['/pesaje'], pestanas: [
    { a: '/compras', texto: 'Compras y pesajes', modulo: 'compras' },
    { a: '/proveedores', texto: 'Proveedores', modulo: 'proveedores' },
  ] },
  { texto: 'Plata', icono: Wallet, tambien: ['/dinero'], pestanas: [
    { a: '/cuentas', texto: 'Cuentas corrientes', modulo: 'cuentas' },
    { a: '/gastos', texto: 'Gastos', modulo: 'gastos' },
    { a: '/caja', texto: 'Caja chica', modulo: 'gastos' },
  ] },
  { texto: 'Tablero', icono: ChartColumn, pestanas: [{ a: '/tablero', texto: 'Tablero', modulo: 'tablero' }] },
];
const AJUSTES: Area = { texto: 'Ajustes', icono: Settings, pestanas: [
  { a: '/maples', texto: 'Maples y recetas', modulo: 'productos' },
  { a: '/equipo', texto: 'Equipo y permisos', modulo: 'usuarios' },
  { a: '/registro', texto: 'Registro de cambios', modulo: 'auditoria' },
] };
const enArea = (area: Area, path: string) => [...area.pestanas.map((x) => x.a), ...(area.tambien ?? [])].some((r) => path === r || path.startsWith(r + '/'));

function Marca() {
  return (
    <div className="marca">
      <img src="/logo.png" width={34} height={33} alt="" style={{ borderRadius: 7 }} />
      <div><b>Moldeados Córdoba</b><small>Planta y administración</small></div>
    </div>
  );
}

export function App() {
  const { sesion, salir, puede } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setAbierto(false), [pathname]);

  if (!sesion) return <Login />;
  const p = (m: Modulo, n: 1 | 2 | 3 = 1) => puede(m, n);

  return (
    <div className="marco">
      <div className="barra-movil">
        <Marca />
        <button className="boton icono" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu size={26} /></button>
      </div>
      <nav className={`lateral${abierto ? ' abierto' : ''}`} aria-label="Secciones">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Marca />
          {abierto && <button className="boton icono" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X size={24} /></button>}
        </div>
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
        <div className="nav-pie">
          <div>{sesion.usuario.nombre}</div>
          <div>{LABEL_ROL[sesion.usuario.rol]}</div>
          <button onClick={salir}><LogOut size={16} aria-hidden /> Salir</button>
        </div>
      </nav>
      <main className="contenido">
        <Pestanas path={pathname} puede={p} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
