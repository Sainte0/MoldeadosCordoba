import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera } from 'lucide-react';

/**
 * Lector de QR con la cámara trasera. Safari de iPhone/iPad no trae lector nativo (BarcodeDetector), así que
 * se decodifica cada cuadro con jsQR. Necesita HTTPS (o localhost) para que el navegador dé la cámara.
 * Llama a `onCodigo` una vez por código: el mismo QR frente a la cámara no se repite hasta pasado un rato.
 */
export function Escaner({ onCodigo, mensaje, alternativa = 'elegí los palets de la lista' }: { onCodigo: (texto: string) => void; mensaje: string; alternativa?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyo, setLeyo] = useState(false);
  const ultimo = useRef<{ texto: string; t: number }>({ texto: '', t: 0 });
  const cb = useRef(onCodigo);
  cb.current = onCodigo;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let vivo = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const leer = () => {
      const v = video.current;
      if (!vivo || !v || !ctx) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        // Se analiza una versión reducida: alcanza para un QR de etiqueta y no recalienta el teléfono.
        const escala = Math.min(1, 640 / v.videoWidth);
        canvas.width = v.videoWidth * escala;
        canvas.height = v.videoHeight * escala;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        const ahora = Date.now();
        if (qr?.data && (qr.data !== ultimo.current.texto || ahora - ultimo.current.t > 3000)) {
          ultimo.current = { texto: qr.data, t: ahora };
          setLeyo(true);
          setTimeout(() => setLeyo(false), 400);
          cb.current(qr.data);
        }
      }
      raf = requestAnimationFrame(leer);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        raf = requestAnimationFrame(leer);
      })
      .catch(() => setError(`No pudimos usar la cámara. Revisá que el navegador tenga permiso (en el iPhone: Ajustes, Safari, Cámara) o ${alternativa}.`));
    if (!navigator.mediaDevices) setError('Este navegador no deja usar la cámara. Elegí los palets de la lista.');

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <div className="escaner-error"><Camera aria-hidden /><p>{error}</p></div>;
  return (
    <div className={`escaner${leyo ? ' leyo' : ''}`}>
      {/* playsInline: sin esto el iPhone abre el video a pantalla completa */}
      <video ref={video} playsInline muted autoPlay />
      <div className="mira" aria-hidden />
      <div className="estado" role="status">{mensaje}</div>
    </div>
  );
}

/** El QR de la etiqueta lleva la dirección del palet; de ahí sale su identificador. */
/** Del texto del QR, el palet: el número (etiquetas nuevas, /palets/12) o el id largo (etiquetas viejas). */
export function idDePalet(texto: string): string | null {
  return /\/palets\/([0-9a-f-]{36}|\d{1,12})(?:[?#/]|$)/i.exec(texto.trim())?.[1] ?? (/^[0-9a-f-]{36}$/i.test(texto.trim()) ? texto.trim() : null);
}
