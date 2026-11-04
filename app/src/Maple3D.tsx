import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Maple de 30 (6 × 5) modelado a mano: alvéolos por torno (lathe), conos entre alvéolos como el maple real,
// y una textura de fibra generada para que se lea como pulpa de cartón y no como plástico.
// Se carga perezoso (solo en el login) para no sumar three.js al resto de la app.

const COLS = 6;
const FILAS = 5;
const PASO = 1;

function texturaFibra(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Fibras: trazos cortos claros y oscuros.
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
    g.lineWidth = 0.6;
    const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * Math.PI, l = 3 + Math.random() * 8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function armarMaple(material: THREE.Material): THREE.Group {
  const grupo = new THREE.Group();
  const ancho = COLS * PASO, largo = FILAS * PASO;
  const x0 = -ancho / 2 + PASO / 2, z0 = -largo / 2 + PASO / 2;

  // Alvéolo: boca ancha, paredes que bajan y fondo redondeado.
  const perfil = [
    new THREE.Vector2(0.001, -0.62),
    new THREE.Vector2(0.18, -0.6),
    new THREE.Vector2(0.27, -0.52),
    new THREE.Vector2(0.36, -0.28),
    new THREE.Vector2(0.43, -0.06),
    new THREE.Vector2(0.46, 0),
  ];
  const alveolo = new THREE.LatheGeometry(perfil, 28);

  // Bandeja: placa con un agujero por alvéolo.
  const borde = new THREE.Shape();
  const m = 0.12;
  borde.moveTo(-ancho / 2 - m, -largo / 2 - m);
  borde.lineTo(ancho / 2 + m, -largo / 2 - m);
  borde.lineTo(ancho / 2 + m, largo / 2 + m);
  borde.lineTo(-ancho / 2 - m, largo / 2 + m);
  borde.closePath();

  for (let c = 0; c < COLS; c++) {
    for (let f = 0; f < FILAS; f++) {
      const x = x0 + c * PASO, z = z0 + f * PASO;
      const a = new THREE.Mesh(alveolo, material);
      a.position.set(x, 0, z);
      grupo.add(a);
      const hueco = new THREE.Path();
      hueco.absarc(x, -z, 0.455, 0, Math.PI * 2, true);
      borde.holes.push(hueco);
    }
  }
  const placa = new THREE.Mesh(new THREE.ExtrudeGeometry(borde, { depth: 0.035, bevelEnabled: false, curveSegments: 28 }), material);
  placa.rotation.x = -Math.PI / 2;
  placa.position.y = -0.035;
  grupo.add(placa);

  // Conos entre alvéolos: separan los huevos y sostienen el maple de arriba al apilar.
  const cono = new THREE.ConeGeometry(0.2, 0.42, 4, 1, true);
  for (let c = 1; c < COLS; c++) {
    for (let f = 1; f < FILAS; f++) {
      const k = new THREE.Mesh(cono, material);
      k.position.set(x0 + (c - 0.5) * PASO, 0.21, z0 + (f - 0.5) * PASO);
      k.rotation.y = Math.PI / 4;
      grupo.add(k);
    }
  }
  return grupo;
}

const CARTON = '#bfae90';

/**
 * `modo="pila"`: login, un maple baja y encastra sobre otro. `modo="giro"`: un maple solo girando, para ver el
 * color de un código. El color se aplica en vivo (al elegirlo en el editor el maple cambia sin recargar).
 */
export default function Maple3D({ color, modo = 'pila' }: { color?: string | null; modo?: 'pila' | 'giro' }) {
  const ref = useRef<HTMLDivElement>(null);
  const material = useRef<THREE.MeshStandardMaterial | null>(null);
  const redibujar = useRef<() => void>(() => {});

  useEffect(() => {
    material.current?.color.set(color || CARTON);
    redibujar.current();
  }, [color]);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camara.position.set(0, 7.5, 9);
    camara.lookAt(0, -0.4, 0);

    escena.add(new THREE.HemisphereLight(0xf4f1e8, 0x0e1a30, 1.1));
    const sol = new THREE.DirectionalLight(0xfff3dc, 2.2);
    sol.position.set(-5, 9, 4);
    escena.add(sol);
    const contra = new THREE.DirectionalLight(0xf2c230, 1.4); // contraluz con el amarillo de la marca
    contra.position.set(4, 2, -6);
    escena.add(contra);

    const fibra = texturaFibra();
    const mat = new THREE.MeshStandardMaterial({ color: color || CARTON, roughness: 0.97, metalness: 0, bumpMap: fibra, bumpScale: 0.6, map: fibra, side: THREE.DoubleSide });
    material.current = mat;
    // Dos maples: uno apoyado y otro que baja y se encastra encima, como en la pila de la planta.
    const abajo = armarMaple(mat);
    const arriba = armarMaple(mat);
    const pila = new THREE.Group();
    pila.add(abajo);
    if (modo === 'pila') pila.add(arriba);
    pila.rotation.set(0.05, -0.55, 0);
    escena.add(pila);

    const ajustar = () => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h, false);
      camara.aspect = w / Math.max(h, 1);
      // En pantallas angostas se aleja para que entre el maple completo.
      camara.position.setLength(modo === 'giro' ? (w / h < 1.1 ? 13 : 11) : w / h < 1.1 ? 16 : 14.5);
      camara.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(ajustar);
    obs.observe(host);
    ajustar();

    const t0 = performance.now();
    let raf = 0;
    const cuadro = () => {
      const t = (performance.now() - t0) / 1000;
      // Una sola secuencia al entrar: el maple de arriba baja y encastra (1,6 s), después solo un giro lento.
      const k = quieto ? 1 : Math.min(1, t / 1.6);
      const facil = 1 - Math.pow(1 - k, 3);
      arriba.position.y = 0.22 + (1 - facil) * 2.6;
      if (!quieto) pila.rotation.y = modo === 'giro' ? -0.55 + t * 0.25 : -0.55 + Math.sin(t * 0.18) * 0.35;
      renderer.render(escena, camara);
      if (!quieto) raf = requestAnimationFrame(cuadro);
    };
    cuadro();
    redibujar.current = () => { if (quieto) renderer.render(escena, camara); };

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      escena.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      mat.dispose();
      material.current = null;
      fibra.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la escena se arma una vez; el color se actualiza aparte
  }, [modo]);

  return <div ref={ref} aria-hidden style={{ position: 'absolute', inset: 0 }} />;
}
