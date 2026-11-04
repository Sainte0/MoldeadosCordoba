import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ChartColumn, ClipboardList, Contact, Coins, Egg, Factory, Home, Layers, LogOut, Menu, Package, Receipt, Scale, ShoppingCart, Tags, Truck, Users, Wallet, X } from 'lucide-react';
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

const NAV: { a: string; texto: string; icono: typeof Home; modulo?: Modulo; nivel?: 1 | 2 }[] = [
  { a: '/', texto: 'Inicio', icono: Home },
  { a: '/tablero', texto: 'Tablero', icono: ChartColumn, modulo: 'tablero' },
  { a: '/ventas', texto: 'Ventas y despachos', icono: Receipt, modulo: 'ventas' },
  { a: '/produccion', texto: 'Producción', icono: Factory, modulo: 'produccion' },
  { a: '/palets', texto: 'Stock y palets', icono: Layers, modulo: 'produccion' },
  { a: '/pesaje', texto: 'Pesaje de cartón', icono: Scale, modulo: 'compras', nivel: 2 },
  { a: '/compras', texto: 'Compras', icono: ShoppingCart, modulo: 'compras' },
  { a: '/materia-prima', texto: 'Materia prima', icono: Package, modulo: 'materias' },
  { a: '/cuentas', texto: 'Cuentas corrientes', icono: Wallet, modulo: 'cuentas' },
  { a: '/gastos', texto: 'Gastos y caja chica', icono: Coins, modulo: 'gastos' },
  { a: '/clientes', texto: 'Clientes', icono: Contact, modulo: 'ventas' },
  { a: '/precios', texto: 'Precios', icono: Tags, modulo: 'ventas' },
  { a: '/proveedores', texto: 'Proveedores', icono: Truck, modulo: 'proveedores' },
  { a: '/maples', texto: 'Maples y recetas', icono: Egg, modulo: 'productos' },
  { a: '/equipo', texto: 'Equipo y permisos', icono: Users, modulo: 'usuarios' },
  { a: '/registro', texto: 'Registro de cambios', icono: ClipboardList, modulo: 'auditoria' },
];

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
        {NAV.filter((n) => !n.modulo || p(n.modulo, n.nivel)).map((n) => (
          <NavLink key={n.a} to={n.a} end={n.a === '/'} className={({ isActive }) => `nav-link${isActive ? ' activo' : ''}`}>
            <n.icono size={20} aria-hidden /> {n.texto}
          </NavLink>
        ))}
        <div className="nav-pie">
          <div style={{ color: '#fff', fontWeight: 600 }}>{sesion.usuario.nombre}</div>
          <div>{LABEL_ROL[sesion.usuario.rol]}</div>
          <button onClick={salir}><LogOut size={16} aria-hidden /> Salir</button>
        </div>
      </nav>
      <main className="contenido">
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
