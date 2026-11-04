import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { api, useSesion } from '../api';
import { Aviso, Campo, Entrada } from '../ui';

const Maple3D = lazy(() => import('../Maple3D'));
// El rojo de los maples de sus fotos.
const ROJO_MAPLE = '#b3262a';
interface MapleCatalogo { nombre: string; colorHex: string | null; tamano?: 'chico' | 'grande' }
// Sin catálogo (sin señal): la pila con los colores de sus maples.
const SIN_CATALOGO: MapleCatalogo[] = [{ nombre: 'Maple grande rojo', colorHex: ROJO_MAPLE }, { nombre: 'Maple grande natural', colorHex: null }];

// El último usuario que entró en este dispositivo: el mismo equipo lo usa siempre, que no haya que tipearlo.
const CLAVE_USUARIO = 'moldeados:ultimo-usuario';
const leer = () => { try { return localStorage.getItem(CLAVE_USUARIO) ?? ''; } catch { return ''; } };
const recordar = (u: string) => { try { localStorage.setItem(CLAVE_USUARIO, u); } catch { /* sin almacenamiento: no pasa nada */ } };

function saludo(): string {
  const h = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

type Modo = 'entrar' | 'pedir' | 'codigo';

export function Login() {
  const { entrar } = useSesion();
  const recordado = leer();
  const [modo, setModo] = useState<Modo>('entrar');
  const [usuario, setUsuario] = useState(recordado);
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  // Los maples que fabrican (lo mismo que su web): se apilan y se muestran de a uno.
  const [catalogo, setCatalogo] = useState<MapleCatalogo[]>(SIN_CATALOGO);
  const [mostrando, setMostrando] = useState(0);
  useEffect(() => {
    api<MapleCatalogo[]>('/publico/maples').then((m) => { if (m.length) setCatalogo(m); }).catch(() => {});
  }, []);
  const actual = catalogo[mostrando] ?? catalogo[0];

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTrabajando(true);
    try {
      if (modo === 'entrar') {
        await entrar(usuario.trim(), password);
        recordar(usuario.trim());
        return;
      }
      if (modo === 'pedir') {
        await api('/auth/recuperar', { method: 'POST', body: { usuario: usuario.trim() } });
        setAviso('Si ese usuario tiene un mail cargado, te mandamos un código de 6 números. Revisá también la carpeta de spam.');
        setPassword('');
        setModo('codigo');
      } else {
        const r = await api<{ usuario: string }>('/auth/restablecer', { method: 'POST', body: { usuario: usuario.trim(), codigo, password } });
        await entrar(r.usuario, password);
        recordar(r.usuario);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo falló. Probá de nuevo.');
    }
    setTrabajando(false);
  };

  const volver = () => { setModo('entrar'); setError(null); setAviso(null); setCodigo(''); setPassword(''); };
  const campoClave = (etiqueta: string, autoComplete: string, foco: boolean) => (
    <Campo etiqueta={etiqueta}>
      <div className="con-ojo">
        <Entrada type={ver ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={autoComplete} required minLength={modo === 'entrar' ? undefined : 6} autoFocus={foco} />
        <button type="button" className="boton icono" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'} aria-pressed={ver}>
          {ver ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </Campo>
  );

  return (
    <div className="login">
      {/* La planta (foto de su fachada) y el maple: la empresa y lo que hace. */}
      <section className="login-escena" aria-hidden>
        <div className="login-marca">
          <img src="/logo.webp" width={40} height={39} alt="" />
          <span>Planta y administración</span>
        </div>
        <div className="login-maple">
          <Suspense fallback={null}><Maple3D colores={catalogo.map((m) => m.colorHex)} chicos={catalogo.map((m) => m.tamano === 'chico')} onMostrando={setMostrando} /></Suspense>
          {actual && (
            <div className="login-maple-etiqueta" key={actual.nombre}>
              <i style={{ background: actual.colorHex ?? '#c9b490' }} />
              <span>{actual.nombre}<em> · 30 huevos</em></span>
            </div>
          )}
        </div>
        <div className="login-pie">
          <p className="nombre">Moldeados<span>Córdoba</span></p>
          <p className="bajada">Maples de pulpa moldeada, de cartón reciclado.</p>
        </div>
      </section>

      <section className="login-form">
        <form onSubmit={enviar}>
          {modo === 'entrar' ? (
            <>
              <div>
                <h1>{saludo()}</h1>
                <p className="tenue">Entrá con tu usuario y tu contraseña.</p>
              </div>
              <Campo etiqueta="Usuario">
                <Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus={!recordado} />
              </Campo>
              {campoClave('Contraseña', 'current-password', !!recordado)}
              <Aviso>{error}</Aviso>
              <button className="boton primario grande" disabled={trabajando}><LogIn size={20} aria-hidden /> {trabajando ? 'Entrando…' : 'Entrar'}</button>
              <button type="button" className="enlace" style={{ justifySelf: 'start' }} onClick={() => { setModo('pedir'); setError(null); }}>¿Olvidaste tu contraseña?</button>
            </>
          ) : modo === 'pedir' ? (
            <>
              <div>
                <h1>Recuperar la contraseña</h1>
                <p className="tenue">Escribí tu usuario o tu mail. Te mandamos un código de 6 números para elegir una contraseña nueva.</p>
              </div>
              <Campo etiqueta="Usuario o mail">
                <Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
              </Campo>
              <Aviso>{error}</Aviso>
              <button className="boton primario grande" disabled={trabajando}><Mail size={20} aria-hidden /> {trabajando ? 'Enviando…' : 'Mandarme el código'}</button>
              <p className="chico tenue">Si tu usuario no tiene mail cargado, pedile a quien administra el sistema que lo agregue o que te cambie la contraseña desde Ajustes › Equipo.</p>
              <button type="button" className="enlace" style={{ justifySelf: 'start' }} onClick={volver}><ArrowLeft size={16} aria-hidden /> Volver a entrar</button>
            </>
          ) : (
            <>
              <div>
                <h1>Ingresá el código</h1>
                <p className="tenue">Elegí también tu contraseña nueva. El código vence en 15 minutos.</p>
              </div>
              {aviso && <Aviso ok>{aviso}</Aviso>}
              <Campo etiqueta="Código">
                <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required autoFocus className="codigo" placeholder="000000" />
              </Campo>
              {campoClave('Contraseña nueva', 'new-password', false)}
              <Aviso>{error}</Aviso>
              <button className="boton primario grande" disabled={trabajando || codigo.length !== 6 || password.length < 6}>{trabajando ? 'Guardando…' : 'Cambiar y entrar'}</button>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <button type="button" className="enlace" onClick={() => { setModo('pedir'); setError(null); setAviso(null); }}>Mandarme otro código</button>
                <button type="button" className="enlace" onClick={volver}>Volver a entrar</button>
              </div>
            </>
          )}
        </form>
        <p className="login-contacto chico tenue">Moldeados Córdoba · Córdoba, Argentina</p>
      </section>
    </div>
  );
}
