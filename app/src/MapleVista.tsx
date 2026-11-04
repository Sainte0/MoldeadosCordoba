import { lazy, Suspense } from 'react';
import { COLOR_CARTON } from '@moldeados/shared/base';

const Maple3D = lazy(() => import('./Maple3D'));

/** Maple 3D en el color del código. Se carga solo cuando aparece (three.js va en su propio archivo). */
export function MapleVista({ color, alto = 220 }: { color: string | null; alto?: number }) {
  return (
    <div className="maple-vista" style={{ height: alto }}>
      <Suspense fallback={null}><Maple3D modo="giro" color={color} /></Suspense>
    </div>
  );
}

/** Alvéolo del color del maple, para listas (no levanta una escena 3D por fila). */
export function Muestra({ color, grande }: { color: string | null; grande?: boolean }) {
  return <span className={`muestra${grande ? ' grande' : ''}`} style={{ ['--c' as string]: color || COLOR_CARTON }} aria-hidden />;
}
