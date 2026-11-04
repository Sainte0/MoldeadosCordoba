import { lazy, Suspense, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useSesion } from '../api';
import { Aviso, Campo, Entrada } from '../ui';

const Maple3D = lazy(() => import('../Maple3D'));

// El último usuario que entró en este teléfono: en planta el mismo equipo lo usa siempre, que no haya que tipearlo.
const CLAVE_USUARIO = 'moldeados:ultimo-usuario';
const leer = () => { try { return localStorage.getItem(CLAVE_USUARIO) ?? ''; } catch { return ''; } };
const guardar = (u: string) => { try { localStorage.setItem(CLAVE_USUARIO, u); } catch { /* sin almacenamiento: no pasa nada */ } };

function saludo(): string {
  const h = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function Login() {
  const { entrar } = useSesion();
  const recordado = leer();
  const [usuario, setUsuario] = useState(recordado);
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  return (
    <div className="login">
      <section className="login-escena" aria-hidden>
        <div className="login-marca">
          <img src="/logo.webp" width={40} height={39} alt="" />
          <span>Planta y administración</span>
        </div>
        {/* El maple tiene su propio lugar: no tapa el nombre en ninguna pantalla. */}
        <div className="login-maple"><Suspense fallback={null}><Maple3D /></Suspense></div>
        <div className="login-pie">
          <p className="nombre">Moldeados<span>Córdoba</span></p>
          <p className="bajada">Maples de pulpa moldeada, de cartón reciclado.</p>
        </div>
      </section>

      <section className="login-form">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setEntrando(true);
            try {
              await entrar(usuario.trim(), password);
              guardar(usuario.trim());
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No pudimos entrar');
              setEntrando(false);
            }
          }}
        >
          <img className="login-logo" src="/logo.webp" width={52} height={51} alt="Moldeados Córdoba" />
          <div>
            <h1>{saludo()}</h1>
            <p className="tenue">Entrá con el usuario que te dio el encargado.</p>
          </div>
          <Campo etiqueta="Usuario">
            <Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus={!recordado} />
          </Campo>
          <Campo etiqueta="Contraseña">
            <div className="con-ojo">
              <Entrada type={ver ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus={!!recordado} />
              <button type="button" className="boton icono" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'} aria-pressed={ver}>
                {ver ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </Campo>
          <Aviso>{error}</Aviso>
          <button className="boton primario grande" disabled={entrando}>
            <LogIn size={20} aria-hidden /> {entrando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="chico tenue">¿Te olvidaste la contraseña? Pedile al encargado que te la cambie desde Ajustes › Equipo.</p>
        </form>
        <p className="login-contacto chico tenue">Moldeados Córdoba · Córdoba, Argentina</p>
      </section>
    </div>
  );
}
