import { lazy, Suspense, useState } from 'react';
import { LogIn } from 'lucide-react';
import { useSesion } from '../api';
import { Aviso, Campo, Entrada } from '../ui';

const Maple3D = lazy(() => import('../Maple3D'));

export function Login() {
  const { entrar } = useSesion();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  return (
    <div className="login">
      <section className="login-escena">
        <Suspense fallback={null}><Maple3D /></Suspense>
        <p className="nombre">Moldeados<span>Córdoba</span></p>
      </section>
      <section className="login-form">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setEntrando(true);
            try {
              await entrar(usuario, password);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No pudimos entrar');
              setEntrando(false);
            }
          }}
        >
          <div>
            <h2>Entrar al sistema</h2>
            <p className="tenue">Con el usuario que te dio el encargado.</p>
          </div>
          <Campo etiqueta="Usuario">
            <Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" required />
          </Campo>
          <Campo etiqueta="Contraseña">
            <Entrada type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Campo>
          <Aviso>{error}</Aviso>
          <button className="boton primario grande" disabled={entrando}>
            <LogIn size={20} aria-hidden /> {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  );
}
