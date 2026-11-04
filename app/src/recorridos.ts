// Recorridos guiados de las guías ("Mostrame cómo"). Aparte de guias.ts para no sumar todo el texto de las guías a
// la carga inicial: el recorrido se monta en toda la app.
// Cada paso lleva a una pantalla (si hace falta) y resalta algo de ella. `en`: selectores CSS separados por coma; se usa
// el primero que se vea en pantalla (así el mismo paso sirve en el iPhone, con menú escondido, y en el iPad).
export interface PasoRecorrido { ruta?: string; en: string; texto: string }
const SIGUIENTE = '.paso-acciones button[type=submit]';

export const RECORRIDOS: Record<string, PasoRecorrido[]> = {
  inicio: [
    { ruta: '/', en: '.tareas', texto: 'Las tareas que más hacés. Tocá una y el sistema te lleva paso a paso, una pregunta por pantalla.' },
    { en: '[data-guia="atencion"]', texto: 'Atención: lo que no puede esperar (stock agotado, pedidos atrasados, cheques, vencimientos). El número en rojo es lo urgente; adentro, cada cosa trae su botón para resolverla.' },
    { en: '.campana', texto: 'La campana: recordatorios de la agenda, lo que te agendaron y los pedidos nuevos. El número rojo es lo que no leíste.' },
    { en: '.lateral, .barra-movil [aria-label="Abrir menú"]', texto: 'El menú: Planta, Ventas, Compras, Plata y Tablero (adentro de cada uno, pestañas). Arriba de todo, "Buscar": un cliente, un n.º de remito o "cómo cargo un egreso". Abajo, Ajustes y Ayuda, con las guías de la pantalla donde estás.' },
  ],
  buscar: [
    { en: '.abrir-buscador, .barra-movil [aria-label="Abrir menú"]', texto: 'Buscar está arriba de todo en el menú (en el celular, abrí el menú con las tres rayitas; en la computadora, también ⌘K). Escribí lo que buscás: secciones, acciones, guías, clientes, remitos, palets. Sin acentos también funciona.' },
  ],
  avisos: [
    { en: '.campana', texto: 'Tocá la campana para ver tus avisos. Adentro, "Activar avisos" hace que te lleguen al teléfono aunque la app esté cerrada.' },
  ],
  despacho: [
    { ruta: '/ventas/nueva', en: '.alveolos', texto: 'Cada alvéolo es un paso; el marcado es donde estás. Son pocos y cada uno pide una sola cosa.' },
    { en: '.escaner, .escaner-error', texto: 'Apuntá la cámara a la etiqueta de cada palet que sube al camión: se van sumando abajo.' },
    { en: '[aria-label="Cómo agregar palets"]', texto: 'Si una etiqueta no se lee, pasá a "Lista" y elegí el palet tocándolo.' },
    { en: '[data-guia="sueltos"]', texto: 'Si se llevan paquetes sin palet, cargalos acá: código y cantidad.' },
    { en: '.instructivo', texto: 'Cada paso tiene su ayuda. El dueño la puede reescribir con el lápiz.' },
    { en: SIGUIENTE, texto: 'Con la carga lista, "Siguiente". Después: cliente, quién retira, calidad y precio, factura, si pagó algo, la firma y confirmar.' },
  ],
  parte: [
    { ruta: '/produccion/nuevo', en: '.paso-cuerpo .opciones', texto: 'Primero el turno. Si cargás un turno de otro día, cambiá la fecha abajo.' },
    { en: '.paso-cuerpo input[type=date]', texto: 'La fecha del turno. Por defecto, hoy.' },
    { en: SIGUIENTE, texto: 'Después: máquina, maple, quiénes trabajaron (ya vienen marcados los del turno), horas, paquetes y lo que se usó.' },
  ],
  palet: [
    { ruta: '/palets/nuevo', en: '.paso-cuerpo .opciones', texto: 'Elegí el maple. A la derecha ves cuántos paquetes hay producidos sin paletizar.' },
    { en: SIGUIENTE, texto: 'Después: cómo se arma (en qué vehículo va, ancho × largo × alto), para quién es, y al confirmar se imprime la etiqueta con el QR.' },
  ],
  pesaje: [
    { ruta: '/pesaje', en: '.paso-cuerpo .opciones, .paso-cuerpo .tenue', texto: 'Elegí el proveedor del camión que está en la báscula. Tocándolo pasa solo al paso siguiente.' },
    { en: '[data-guia="nuevo"]', texto: 'Si es la primera vez que viene, "Es un proveedor nuevo": con el nombre alcanza. Se guarda recién al terminar el pesaje.' },
    { en: SIGUIENTE, texto: 'Después: bruto y tara del camión (el sistema calcula los kilos), precio por kilo, si viene con factura, y se imprime el ticket.' },
  ],
  cobro: [
    { ruta: '/dinero/nuevo?tipo=cobro', en: '.paso-cuerpo .opciones', texto: 'Los clientes que deben están primero, en rojo con lo que deben; en verde los que están al día. Tocá el que pagó.' },
    { en: '[data-guia="nuevo"]', texto: 'Si no está en la lista, cargalo con el nombre.' },
    { en: SIGUIENTE, texto: 'Después: cómo pagó (efectivo, transferencia, Mercado Pago, e-Cheq o cheque), cuánto, y guardar. Se descuenta de su saldo.' },
  ],
  gasto: [
    { ruta: '/egresos/nuevo', en: '.paso-cuerpo .opciones', texto: 'Elegí la categoría: sueldos, impuestos, Ecogas, mantenimiento, pallets… Así el balance muestra en qué se va la plata.' },
    { en: SIGUIENTE, texto: 'Después: monto, concepto y a quién; si ya se pagó (y cómo) o queda pendiente con su vencimiento; y la foto del comprobante.' },
  ],
  agenda: [
    { ruta: '/agenda', en: '[data-guia="agenda-nuevo"]', texto: 'Nuevo recordatorio: qué, cuándo (con hora y si se repite) y para quién: vos, algunas personas o todo el equipo.' },
    { en: '.chips', texto: 'Si sos el dueño, acá elegís de quién ver la agenda: la tuya, la de una o varias personas, o la de todo el equipo.' },
    { en: '[aria-label="Vista"]', texto: '"Próximos días" en lista, o "Mes" en calendario.' },
    { ruta: '/agenda?vista=mes', en: '.calendario', texto: 'El mes: tocá un día para ver lo que tiene abajo o agendar algo ese día. Con las flechas pasás de mes.' },
  ],
  tablero: [
    { ruta: '/tablero', en: '[aria-label="Período"]', texto: 'Elegí el período: este mes, el pasado, los últimos 30 días o el año.' },
    { en: '.cifras', texto: 'El resultado (ventas menos egresos), lo vendido, lo comprado y los egresos; abajo, lo que nos deben y lo que debemos.' },
    { en: '.tabla-balance, .hoja h3', texto: 'El balance mes por mes, con las mismas columnas que la planilla de finanzas.' },
  ],
};
