import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/**
 * Recuadro para firmar con el dedo (iPhone/iPad) o el mouse. Devuelve la firma como PNG en base64 (sin el
 * prefijo data:), o null si se borró. Usa pointer events: un solo código para dedo, lápiz y mouse.
 */
export function Firma({ onCambio, alto = 200 }: { onCambio: (png: string | null) => void; alto?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const escala = window.devicePixelRatio || 1;
    c.width = c.clientWidth * escala;
    c.height = alto * escala;
    const g = c.getContext('2d')!;
    g.scale(escala, escala);
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#0e1a30';
  }, [alto]);

  const punto = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    onCambio(canvas.current!.toDataURL('image/png').split(',')[1]!);
  };
  const borrar = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setVacia(true);
    onCambio(null);
  };

  return (
    <div className="firma-pad">
      <canvas
        ref={canvas}
        style={{ height: alto }}
        aria-label="Recuadro para firmar"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dibujando.current = true;
          setVacia(false);
          const g = canvas.current!.getContext('2d')!;
          const [x, y] = punto(e);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 0.1, y + 0.1);
          g.stroke();
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const g = canvas.current!.getContext('2d')!;
          const [x, y] = punto(e);
          g.lineTo(x, y);
          g.stroke();
        }}
        onPointerUp={terminar}
        onPointerCancel={terminar}
      />
      {vacia ? <span className="firma-guia" aria-hidden>Firmá acá</span> : (
        <button type="button" className="boton fantasma firma-borrar" onClick={borrar}><Eraser size={16} aria-hidden /> Borrar</button>
      )}
    </div>
  );
}
