import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Maple de 30 (6 × 5) como UNA superficie continua de pulpa, igual que sale del molde: alvéolos redondos,
// conos entre alvéolos y un borde plano. Se arma con una malla de alturas (PlaneGeometry + función de altura),
// que da la forma suave del cartón moldeado. Se carga perezoso para no sumar three.js al resto de la app.

const COLS = 6;
const FILAS = 5;
const BORDE = 0.22;
const ANCHO = COLS + BORDE * 2;
const LARGO = FILAS + BORDE * 2;
const HONDO = 0.5; // profundidad del alvéolo
const CONO = 0.55; // altura de los conos entre alvéolos
const GROSOR = 0.05;

/** 1 en el centro, 0 en el borde, con hombros suaves. */
const loma = (t: number) => (t >= 1 ? 0 : (1 - t * t) ** 2);

/** Altura de la pulpa en (x, z). */
function altura(x: number, z: number): number {
  const gx = x + COLS / 2, gz = z + FILAS / 2;
  if (gx < 0 || gx > COLS || gz < 0 || gz > FILAS) {
    // Borde: plano y con la orilla doblada hacia abajo.
    const fuera = Math.max(-gx, gx - COLS, -gz, gz - FILAS, 0);
    return fuera > BORDE - 0.07 ? -0.12 * ((fuera - (BORDE - 0.07)) / 0.07) : 0;
  }
  const u = (gx % 1) - 0.5, v = (gz % 1) - 0.5;
  const alveolo = -HONDO * loma(Math.hypot(u, v) / 0.48);
  // Cono en la esquina más cercana, solo en las esquinas interiores (las del borde no llevan).
  const cx = Math.round(gx), cz = Math.round(gz);
  const interior = cx > 0 && cx < COLS && cz > 0 && cz < FILAS;
  const cono = interior ? CONO * loma(Math.hypot(gx - cx, gz - cz) / 0.3) : 0;
  return alveolo + cono;
}

function texturaFibra(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 214 + Math.random() * 41; // variación leve: que se lea como pulpa sin ensuciar el color
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 700; i++) {
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.12)';
    g.lineWidth = 0.7;
    const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * Math.PI, l = 3 + Math.random() * 7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Superficie del maple (geometría compartida entre maples). */
function geometriaMaple(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(ANCHO, LARGO, 200, 168);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, altura(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}

function armarMaple(geo: THREE.BufferGeometry, material: THREE.Material): THREE.Group {
  const grupo = new THREE.Group();
  const arriba = new THREE.Mesh(geo, material);
  // Cara de abajo, apenas más baja: le da espesor al cartón visto desde el costado.
  const abajo = new THREE.Mesh(geo, material);
  abajo.position.y = -GROSOR;
  grupo.add(arriba, abajo);
  return grupo;
}

/** Huevos en algunos alvéolos: es lo que hace que se entienda de un vistazo qué es. */
function huevos(): THREE.Group {
  const grupo = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.3, 32, 24);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Forma de huevo: más angosto arriba que abajo.
    const k = 1 - 0.14 * (y / 0.3);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
    pos.setY(i, y * 1.3);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#f1dcc0', roughness: 0.55 });
  const vacios = new Set(['5,0', '4,0', '5,1', '0,4', '2,4']);
  for (let c = 0; c < COLS; c++) {
    for (let f = 0; f < FILAS; f++) {
      if (vacios.has(`${c},${f}`)) continue;
      const h = new THREE.Mesh(geo, mat);
      h.position.set(c - COLS / 2 + 0.5, -HONDO + 0.36, f - FILAS / 2 + 0.5);
      h.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 6, (Math.random() - 0.5) * 0.12);
      grupo.add(h);
    }
  }
  return grupo;
}

const CARTON = '#c9b490';

/**
 * `modo="pila"`: login, un maple baja y encastra sobre otro. `modo="giro"`: un maple con huevos girando lento,
 * para ver el color de un código. El color se aplica en vivo (al elegirlo en el editor el maple cambia sin recargar).
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'; // si no, en retina se ve 2-3 veces más grande y cortado
    host.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    escena.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const sol = new THREE.DirectionalLight(0xfff6ea, 2.4);
    sol.position.set(-4, 10, 5);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.camera.left = sol.shadow.camera.bottom = -6;
    sol.shadow.camera.right = sol.shadow.camera.top = 6;
    sol.shadow.radius = 4;
    sol.shadow.bias = -0.0015;
    escena.add(sol);

    const fibra = texturaFibra();
    const mat = new THREE.MeshStandardMaterial({ color: color || CARTON, roughness: 1, metalness: 0, map: fibra, bumpMap: fibra, bumpScale: 0.4, side: THREE.DoubleSide });
    material.current = mat;
    const geo = geometriaMaple();

    const pila = new THREE.Group();
    const abajo = armarMaple(geo, mat);
    const arriba = armarMaple(geo, mat);
    pila.add(abajo);
    if (modo === 'pila') pila.add(arriba);
    else pila.add(huevos());
    pila.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    escena.add(pila);

    // Sombra de apoyo sobre un piso invisible: ancla el maple, sin dibujar un "piso".
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.16 }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = -HONDO - GROSOR - 0.02;
    piso.receiveShadow = true;
    escena.add(piso);

    const ajustar = () => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h, false);
      camara.aspect = w / Math.max(h, 1);
      // Vista de tres cuartos. La distancia sale de encuadrar la esfera que envuelve al maple con el campo de
      // visión más angosto (vertical u horizontal), así entra entero en cualquier proporción de pantalla.
      const radio = modo === 'pila' ? 4.3 : 3.9;
      const mitadV = THREE.MathUtils.degToRad(camara.fov / 2);
      const mitadH = Math.atan(Math.tan(mitadV) * camara.aspect);
      const dist = (radio / Math.sin(Math.min(mitadV, mitadH))) * (modo === 'pila' ? 1.2 : 0.78);
      camara.position.set(0, dist * 0.72, dist * 0.69);
      camara.lookAt(0, modo === 'pila' ? 0.3 : -0.15, 0);
      camara.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(ajustar);
    obs.observe(host);
    ajustar();

    const t0 = performance.now();
    let raf = 0;
    const cuadro = () => {
      const t = (performance.now() - t0) / 1000;
      // Una sola secuencia al entrar: el maple de arriba baja y encastra (1,6 s); después, giro lento.
      const k = quieto ? 1 : Math.min(1, t / 1.6);
      const facil = 1 - Math.pow(1 - k, 3);
      arriba.position.y = 0.16 + (1 - facil) * 2.4;
      pila.rotation.y = quieto ? -0.5 : modo === 'giro' ? -0.5 + Math.sin(t * 0.35) * 0.45 : -0.5 + Math.sin(t * 0.18) * 0.3;
      renderer.render(escena, camara);
      if (!quieto) raf = requestAnimationFrame(cuadro);
    };
    cuadro();
    redibujar.current = () => { if (quieto) renderer.render(escena, camara); };

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      escena.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (o.material !== mat) (o.material as THREE.Material).dispose();
        }
      });
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
