import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Maple de 30 (6 × 5) como UNA superficie continua de pulpa, igual que sale del molde: alvéolos redondos,
// conos entre alvéolos y un borde plano. Se arma con una malla de alturas (PlaneGeometry + función de altura),
// que da la forma suave del cartón moldeado. Se carga perezoso para no sumar three.js al resto de la app.

const COLS = 6;
const FILAS = 5;
const BORDE = 0.24;
const ANCHO = COLS + BORDE * 2;
const LARGO = FILAS + BORDE * 2;
const HONDO = 0.42; // profundidad del alvéolo (además de la silla)
const SILLA = 0.1; // cuánto suben las paredes entre alvéolos hacia las esquinas
const CONO = 0.4; // altura de los conos entre alvéolos (sobre la silla)
const GROSOR = 0.045;

/** 1 en el centro, 0 en el borde, con hombros suaves. */
const loma = (t: number) => (t >= 1 ? 0 : (1 - t * t) ** 2);
const suave = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Altura de la pulpa en (x, z). Como el maple real: cada alvéolo es una copa redonda que llega hasta el borde de su
 * celda; entre copas, la pared sube en "silla" hacia las esquinas, y en cada esquina interior hay un cono que sostiene
 * al maple de arriba. Alrededor, un ala plana con la orilla doblada.
 */
function altura(x: number, z: number): number {
  const gx = x + COLS / 2, gz = z + FILAS / 2;
  const fuera = Math.max(-gx, gx - COLS, -gz, gz - FILAS);
  if (fuera > 0) {
    // Ala: plana y con la orilla doblada hacia abajo.
    return fuera > BORDE - 0.08 ? -0.14 * ((fuera - (BORDE - 0.08)) / 0.08) ** 1.5 : 0;
  }
  const u = gx - Math.floor(gx) - 0.5, v = gz - Math.floor(gz) - 0.5;
  const copa = -HONDO * loma(Math.hypot(u, v) / 0.53);
  // La silla se apaga cerca del ala para que el borde quede plano y continuo.
  const silla = -SILLA * (Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v)) * suave(0, 0.5, -fuera);
  const cx = Math.round(gx), cz = Math.round(gz);
  const interior = cx > 0 && cx < COLS && cz > 0 && cz < FILAS;
  const cono = interior ? CONO * loma(Math.hypot(gx - cx, gz - cz) / 0.32) : 0;
  return copa + silla + cono;
}

/** Pulpa de cartón: manchas suaves (fibra más o menos prensada) y fibras sueltas. */
function texturaFibra(): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9e9e9';
  g.fillRect(0, 0, n, n);
  // Manchas grandes y difusas.
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * n, y = Math.random() * n, r = 12 + Math.random() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const claro = Math.random() > 0.5;
    gr.addColorStop(0, claro ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grano fino.
  const img = g.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (Math.random() - 0.5) * 26;
    for (let k = 0; k < 3; k++) img.data[i + k] = img.data[i + k]! + d;
  }
  g.putImageData(img, 0, 0);
  // Fibras: trazos curvos cortos, claros y oscuros.
  for (let i = 0; i < 1600; i++) {
    g.strokeStyle = Math.random() > 0.45 ? `rgba(255,255,255,${0.25 + Math.random() * 0.3})` : `rgba(40,30,20,${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 0.7;
    const x = Math.random() * n, y = Math.random() * n, a = Math.random() * Math.PI * 2, l = 4 + Math.random() * 12;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Superficie del maple (geometría compartida entre maples), con sombra de contacto pintada en los vértices. */
function geometriaMaple(): THREE.BufferGeometry {
  // ~24 segmentos por alvéolo: suave y liviano con varios maples en pantalla.
  const g = new THREE.PlaneGeometry(ANCHO, LARGO, 156, 132);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const colores = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = altura(p.getX(i), p.getZ(i));
    p.setY(i, y);
    // Lo hondo de cada alvéolo recibe menos luz: más oscuro; crestas y conos, más claros.
    const luz = 0.58 + 0.42 * suave(-HONDO - SILLA * 2, CONO * 0.6, y);
    colores[i * 3] = colores[i * 3 + 1] = colores[i * 3 + 2] = luz;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
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
      h.position.set(c - COLS / 2 + 0.5, -HONDO - SILLA * 2 + 0.4, f - FILAS / 2 + 0.5);
      h.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 6, (Math.random() - 0.5) * 0.12);
      grupo.add(h);
    }
  }
  return grupo;
}

const CARTON = '#c9b490';

// Colores para la pila cuando no hay catálogo (sin señal o sin códigos cargados): los de sus maples.
const COLORES_PILA = ['#b3262a', CARTON, '#1f4fa8', '#2f7a3d', '#e2b21f'];
const ALTO_NIVEL = 0.2; // lo que sube cada maple al encastrar en la pila
const CAIDA = 0.7; // segundos que tarda en caer cada maple
const ENTRE_CAIDAS = 0.42;
const POR_MAPLE = 3; // segundos que se muestra cada uno
const ALTO_VITRINA = 1.15; // a qué altura sobre la pila flota el que se muestra

/**
 * `modo="pila"` (entrada): los maples del catálogo caen uno por uno y se apilan como en la planta; después, de a uno,
 * cada maple sale de la pila hacia adelante (como un cajón) para verlo, y avisa cuál es con `onMostrando`.
 * `modo="giro"`: un maple con huevos girando lento, para ver el color de un código (se cambia en vivo).
 */
export default function Maple3D({ color, modo = 'pila', colores, chicos, onMostrando }: { color?: string | null; modo?: 'pila' | 'giro'; colores?: (string | null)[]; chicos?: boolean[]; onMostrando?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const material = useRef<THREE.MeshStandardMaterial | null>(null);
  const redibujar = useRef<() => void>(() => {});
  const avisar = useRef(onMostrando);
  avisar.current = onMostrando;
  const paleta = (colores?.length ? colores : COLORES_PILA).slice(0, 6).map((c) => c || CARTON);
  const clavePaleta = paleta.join(',') + (chicos ?? []).join(',');

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
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'; // si no, en retina se ve 2-3 veces más grande y cortado
    host.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // Luz de ambiente interior (reflejos suaves desde todos lados): el cartón deja de verse plástico.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    escena.environment = ambiente;
    escena.environmentIntensity = 0.55;
    escena.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.9));
    const sol = new THREE.DirectionalLight(0xfff6ea, 2.4);
    sol.position.set(-4, 10, 5);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.camera.left = sol.shadow.camera.bottom = -7;
    sol.shadow.camera.right = sol.shadow.camera.top = 7;
    sol.shadow.radius = 4;
    sol.shadow.bias = -0.0015;
    escena.add(sol);

    const fibra = texturaFibra();
    const nuevoMat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.96, metalness: 0, map: fibra, bumpMap: fibra, bumpScale: 1.2, vertexColors: true, side: THREE.DoubleSide });
    const geo = geometriaMaple();
    const grupo = new THREE.Group();
    const materiales: THREE.Material[] = [];

    // Giro: un maple con huevos, del color del código. Pila: un maple por color del catálogo.
    const maples: THREE.Group[] = [];
    if (modo === 'giro') {
      const mat = nuevoMat(color || CARTON);
      material.current = mat;
      materiales.push(mat);
      grupo.add(armarMaple(geo, mat), huevos());
    } else {
      for (const c of paleta) {
        const mat = nuevoMat(c);
        materiales.push(mat);
        const m = armarMaple(geo, mat);
        maples.push(m);
        grupo.add(m);
      }
    }
    // Vitrina (pila): arriba de la pila flota el maple que se está mostrando, con huevos, del color de su código.
    const matVitrina = nuevoMat(paleta[paleta.length - 1] ?? CARTON);
    materiales.push(matVitrina);
    const vitrina = new THREE.Group();
    if (modo === 'pila') {
      vitrina.add(armarMaple(geo, matVitrina), huevos());
      vitrina.visible = false;
      grupo.add(vitrina);
    }
    grupo.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    escena.add(grupo);

    // Sombra de apoyo sobre un piso invisible: ancla el maple, sin dibujar un "piso".
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.16 }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = -HONDO - SILLA * 2 - GROSOR - 0.02;
    piso.receiveShadow = true;
    escena.add(piso);

    const altoPila = maples.length * ALTO_NIVEL;
    const ajustar = () => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h, false);
      camara.aspect = w / Math.max(h, 1);
      // Vista de tres cuartos. La distancia sale de encuadrar la esfera que envuelve lo que se muestra con el campo de
      // visión más angosto (vertical u horizontal), así entra entero en cualquier proporción de pantalla. En la pila se
      // deja lugar para el maple que sale hacia adelante.
      const radio = modo === 'pila' ? 4.4 + altoPila * 0.3 : 3.9;
      const mitadV = THREE.MathUtils.degToRad(camara.fov / 2);
      const mitadH = Math.atan(Math.tan(mitadV) * camara.aspect);
      const dist = (radio / Math.sin(Math.min(mitadV, mitadH))) * (modo === 'pila' ? 1.12 : 0.78);
      // La pila se mira más de costado, para que se vean las capas de colores; el maple suelto, más de arriba.
      if (modo === 'pila') camara.position.set(0, dist * 0.5, dist * 0.87);
      else camara.position.set(0, dist * 0.72, dist * 0.69);
      camara.lookAt(0, modo === 'pila' ? (altoPila + ALTO_VITRINA) / 2 : -0.15, 0);
      camara.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(ajustar);
    obs.observe(host);
    ajustar();

    const finEntrada = maples.length ? (maples.length - 1) * ENTRE_CAIDAS + CAIDA : 0;
    let mostrando = -1;
    let desde = 0; // cuándo empezó a mostrarse el actual (para que caiga a la vitrina)
    const t0 = performance.now();
    let raf = 0;
    let previo = t0;
    const cuadro = () => {
      const ahora = performance.now();
      const t = (ahora - t0) / 1000;
      const dt = Math.min(0.05, (ahora - previo) / 1000);
      previo = ahora;
      if (modo === 'giro') {
        grupo.rotation.y = quieto ? -0.5 : -0.5 + Math.sin(t * 0.35) * 0.45;
      } else {
        // Primero caen y se apilan; después, cada POR_MAPLE segundos, uno distinto (de arriba hacia abajo) cae a la
        // vitrina sobre la pila y se presenta.
        const empieza = finEntrada + 0.3;
        const toca = quieto ? maples.length - 1 : t < empieza ? -1 : maples.length - 1 - (Math.floor((t - empieza) / POR_MAPLE) % maples.length);
        if (toca !== mostrando) {
          mostrando = toca;
          desde = t;
          if (toca >= 0) {
            matVitrina.color.set(paleta[toca]!);
            // El chico se ve más chico que el grande: el tamaño también se muestra.
            vitrina.scale.setScalar(chicos?.[toca] ? 0.66 : 0.8);
            avisar.current?.(toca);
          }
        }
        maples.forEach((m, i) => {
          // Cada uno cae desde arriba, después del anterior, y frena al encastrar.
          const k = quieto ? 1 : Math.min(1, Math.max(0, (t - i * ENTRE_CAIDAS) / CAIDA));
          m.visible = quieto || t >= i * ENTRE_CAIDAS;
          m.position.y = i * ALTO_NIVEL + (1 - k) ** 3 * 3;
        });
        vitrina.visible = toca >= 0;
        if (toca >= 0) {
          const k = quieto ? 1 : Math.min(1, (t - desde) / 0.55);
          const flota = quieto ? 0 : Math.sin(t * 1.6) * 0.06;
          vitrina.position.set(0.1, altoPila + ALTO_VITRINA + (1 - k) ** 3 * 2.6 + flota, 0.25);
          vitrina.rotation.set(0.42, 0.25 + (quieto ? 0 : Math.sin(t * 0.5) * 0.12), 0);
        }
        grupo.rotation.y = quieto ? -0.45 : -0.45 + Math.sin(t * 0.16) * 0.2;
      }
      renderer.render(escena, camara);
      if (!quieto) raf = requestAnimationFrame(cuadro);
    };
    cuadro();
    redibujar.current = () => { if (quieto) renderer.render(escena, camara); };

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      geo.dispose();
      escena.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== geo) {
          o.geometry.dispose();
          if (!materiales.includes(o.material as THREE.Material)) (o.material as THREE.Material).dispose();
        }
      });
      materiales.forEach((m) => m.dispose());
      material.current = null;
      fibra.dispose();
      ambiente.dispose();
      pmrem.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la escena se arma una vez por modo y catálogo; el color del giro se actualiza aparte
  }, [modo, clavePaleta]);

  return <div ref={ref} aria-hidden style={{ position: 'absolute', inset: 0 }} />;
}
