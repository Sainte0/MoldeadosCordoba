// Recorridos guiados de las guías ("Mostrame cómo"). Aparte de guias.ts para no sumar todo el texto de las guías a
// la carga inicial: el recorrido se monta en toda la app.
// Cada paso lleva a una pantalla (si hace falta) y resalta algo de ella. `en`: selectores CSS separados por coma; se usa
// el primero que se vea en pantalla (así el mismo paso sirve en el iPhone, con menú escondido, y en el iPad).
export interface PasoRecorrido { ruta?: string; en: string; texto: string }
const SIGUIENTE = '.paso-acciones button[type=submit]';

export const RECORRIDOS: Record<string, PasoRecorrido[]> = {
  inicio: [
    { ruta: '/', en: '.planilla .cifras, .tareas', texto: 'Hoy: arriba el resumen del día; abajo, las órdenes para cargar, los pallets que salieron de la plastificadora, lo vendido y lo que hay en la fábrica por tipo y alto.' },
    { en: '[data-guia="atencion"]', texto: 'Atención: lo que no puede esperar (stock agotado, pedidos atrasados, cheques, vencimientos). El número en rojo es lo urgente; adentro, cada cosa trae su botón para resolverla.' },
    { en: '.campana', texto: 'La campana: recordatorios de la agenda, lo que te agendaron y los pedidos nuevos. El número rojo es lo que no leíste.' },
    { en: '.barra-inferior, .lateral', texto: 'Para moverte: en el iPhone, la barra de abajo (Inicio, tu tarea principal, Escanear un palet, Buscar y "Más" con todas las secciones). En el iPad y la computadora, el menú del costado: Planta, Ventas, Compras, Plata y Tablero, con Buscar arriba y Ajustes y Ayuda abajo.' },
  ],
  buscar: [
    { en: '.abrir-buscador, .barra-inferior button:first-of-type', texto: 'Buscar: en el iPhone está abajo; en el iPad y la computadora, arriba de todo en el menú (también ⌘K). Escribí lo que buscás: secciones, acciones, guías, clientes, remitos, palets. Sin acentos también funciona.' },
  ],
  avisos: [
    { en: '.campana', texto: 'Tocá la campana para ver tus avisos. Adentro, "Activar avisos" hace que te lleguen al teléfono aunque la app esté cerrada.' },
  ],
  orden: [
    { ruta: '/ordenes/nueva', en: 'select.entrada', texto: 'Elegí el cliente. Después aparecen el chofer (primero los de ese cliente), qué se lleva y la condición de pago.' },
    { en: '.acciones .boton.primario', texto: '"Emitir orden": queda abierta en la pantalla de carga hasta que se escanee el último pallet.' },
  ],
  carga: [
    { ruta: '/ordenes', en: '.pestanas, .hoja', texto: 'Las órdenes para cargar. Tocá una para abrir su pantalla de carga: un contador grande por renglón y el campo listo para la pistola QR.' },
  ],
  palet: [
    { ruta: '/plastificar', en: '.tecla-grupo', texto: 'Tocá tamaño, color y alto. Botones grandes, nada para escribir.' },
    { en: '.tecla-confirmar', texto: 'Confirmar: el pallet entra al stock y sale la etiqueta con su QR para pegar en el film.' },
  ],
  planilla: [
    { ruta: '/', en: '.planilla .cifras', texto: 'El resumen del día: pallets que salieron, lo vendido, lo cobrado y lo que hay en la fábrica. Cada tarjeta se toca.' },
    { en: '.planilla > section:first-of-type', texto: 'Las órdenes para cargar (o, si no ves ventas, los pallets de hoy). Tocá una para abrirla.' },
    { en: '.planilla > section:last-of-type', texto: 'En la fábrica: los pallets por tipo y alto.' },
  ],
  parte: [
    { ruta: '/produccion/nuevo', en: '.paso-cuerpo .opciones', texto: 'Primero el turno. Si cargás un turno de otro día, cambiá la fecha abajo.' },
    { en: '.paso-cuerpo input[type=date]', texto: 'La fecha del turno. Por defecto, hoy.' },
    { en: SIGUIENTE, texto: 'Después: máquina, maple, quiénes trabajaron (ya vienen marcados los del turno), horas, paquetes y lo que se usó.' },
  ],
  pesaje: [
    { ruta: '/pesaje', en: '.paso-cuerpo .opciones, .paso-cuerpo .tenue', texto: 'Elegí el proveedor del camión que está en la báscula. Tocándolo pasa solo al paso siguiente.' },
    { en: '[data-guia="nuevo"]', texto: 'Si es la primera vez que viene, "Es un proveedor nuevo": con el nombre alcanza. Se guarda recién al terminar la carga.' },
    { en: SIGUIENTE, texto: 'Después: bruto y tara del camión (el sistema calcula los kilos), precio por kilo, si va a Cuenta 1 o Cuenta 2, y se imprime el ticket.' },
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
