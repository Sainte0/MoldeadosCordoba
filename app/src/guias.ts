// Guías de uso del sistema: cómo hacer cada cosa en cada pantalla. Las busca el centro de ayuda y se abren solas
// según la pantalla en la que está la persona (`pantallas` = rutas donde aplica; prefijo).
// Los procedimientos de la planta (cómo se hace un maple, limpieza, etc.) no van acá: los escribe el cliente.

export interface Guia {
  id: string;
  area: 'Primeros pasos' | 'Planta' | 'Ventas' | 'Compras' | 'Plata' | 'Tablero' | 'Ajustes';
  titulo: string;
  pantallas: string[];
  pasos: string[];
  /** Otras palabras con las que alguien lo buscaría. */
  palabras: string;
}

export const GUIAS: Guia[] = [
  {
    id: 'instalar', area: 'Primeros pasos', titulo: 'Instalar el sistema en el iPhone o el iPad', pantallas: ['/'],
    palabras: 'app icono pantalla de inicio celular tablet acceso directo',
    pasos: [
      'Abrí el sistema en Safari e ingresá con tu usuario.',
      'Tocá el botón Compartir (el cuadrado con la flecha hacia arriba).',
      'Elegí "Agregar a pantalla de inicio" y tocá "Agregar".',
      'Desde ahora abrís el sistema con el ícono de Moldeados, a pantalla completa, como una app.',
    ],
  },
  {
    id: 'entrar', area: 'Primeros pasos', titulo: 'Entrar, salir y cambiar la contraseña', pantallas: ['/'],
    palabras: 'login usuario contraseña clave olvidé sesión cerrar',
    pasos: [
      'Entrá con el usuario y la contraseña que te dio el encargado.',
      'Para salir, abrí el menú y tocá "Salir" abajo de todo.',
      'Si te olvidaste la contraseña, pedile al dueño que te ponga una nueva desde Ajustes › Equipo y permisos.',
      'La sesión dura una semana y se renueva sola cada vez que abrís el sistema: si lo usás seguido, no te vuelve a pedir la contraseña.',
    ],
  },
  {
    id: 'sin-senal', area: 'Primeros pasos', titulo: 'Trabajar sin señal', pantallas: ['/'],
    palabras: 'sin señal internet offline conexion wifi datos playon guardado telefono subir',
    pasos: [
      'Abrí el sistema al menos una vez con señal en cada teléfono o iPad: queda guardado lo necesario para trabajar sin conexión.',
      'Sin señal podés cargar partes de producción, despachos (escaneando los palets) y pesajes. Arriba aparece un aviso amarillo.',
      'Lo que cargás queda guardado en el teléfono y se sube solo cuando vuelve la señal. No hace falta hacer nada.',
      'Si al subirse el sistema rechaza algo (por ejemplo, ese palet ya lo había despachado otra persona), aparece en rojo con el motivo para revisarlo.',
      'Armar palets, cobrar y lo administrativo necesitan señal.',
    ],
  },
  {
    id: 'buscar', area: 'Primeros pasos', titulo: 'Buscar cualquier cosa', pantallas: ['/'],
    palabras: 'buscar buscador encontrar lupa atajo comando cliente remito numero',
    pasos: [
      'Tocá la lupa (arriba en el celular, o "Buscar" en el menú). En la computadora también abre con ⌘K o Ctrl+K.',
      'Escribí lo que necesitás: una sección ("caja chica"), algo que querés hacer ("cargar gasto"), un cliente, un proveedor o un número de remito, ticket, palet o parte.',
      'Elegí el resultado y te lleva directo. Con el teclado: flechas para moverte y Enter para abrir.',
      'Cada listado tiene además su propio buscador arriba: busca sin importar acentos y también por número.',
    ],
  },
  {
    id: 'compartir', area: 'Primeros pasos', titulo: 'Guardar o compartir una pantalla con sus filtros', pantallas: ['/'],
    palabras: 'compartir link enlace url filtros guardar favorito whatsapp',
    pasos: [
      'Los filtros y la búsqueda de cada pantalla quedan en la dirección (por ejemplo, ventas de un cliente en un mes).',
      'Copiá el link o compartilo por WhatsApp: quien lo abra ve exactamente lo mismo, según sus permisos.',
      'También podés recargar la página o guardarla en favoritos y vuelve con los mismos filtros.',
    ],
  },
  {
    id: 'inicio', area: 'Primeros pasos', titulo: 'Qué muestra la pantalla de inicio', pantallas: ['/'],
    palabras: 'inicio tareas avisos para vender hay que comprar',
    pasos: [
      'Arriba están las tareas que más hacés según tu rol: tocá una y el sistema te guía paso a paso.',
      '"Para vender" lista los clientes a los que les toca comprar o que dejaron de comprar. Tocá WhatsApp para escribirles con el mensaje armado.',
      '"Hay que comprar" avisa qué materia prima se acaba pronto según lo que se viene usando.',
      'Más abajo ves el stock de maples y de materia prima, y lo cargado hoy.',
    ],
  },
  {
    id: 'pesaje', area: 'Compras', titulo: 'Registrar el pesaje de un camión de cartón', pantallas: ['/pesaje', '/compras'],
    palabras: 'bascula balanza ticket bruto tara neto carton camion reciclador supermercado',
    pasos: [
      'Desde Inicio tocá "Pesaje de cartón" (o en Compras, el botón "Pesaje de cartón").',
      'Elegí el proveedor. Si es nuevo, tocá "Es un proveedor nuevo", escribí el nombre y seguí.',
      'Anotá el peso bruto (camión cargado) y la tara (camión vacío). El sistema calcula el neto. Podés escribir 8.420 o 8420.',
      'Revisá el precio por kilo: viene el de la última compra a ese proveedor.',
      'Marcá si vino con factura o sin factura, y el IVA si corresponde.',
      'Revisá y tocá "Guardar ticket". El cartón se suma al stock y podés imprimir el ticket.',
    ],
  },
  {
    id: 'compra', area: 'Compras', titulo: 'Cargar una compra de tinta, aglutinante u otros', pantallas: ['/compras'],
    palabras: 'insumos tinta color aglutinante encolante factura proveedor comprar',
    pasos: [
      'En Compras tocá "Nueva compra" (o desde Inicio, "Compra de insumos").',
      'Elegí el proveedor.',
      'Elegí el producto, anotá la cantidad y el precio por litro o kilo sin IVA, y tocá "Agregar a la compra". Repetí para cada producto.',
      'Marcá si vino con factura y la alícuota de IVA.',
      'Revisá el total y tocá "Guardar compra". Lo comprado se suma al stock.',
    ],
  },
  {
    id: 'anular-compra', area: 'Compras', titulo: 'Anular una compra o un ticket mal cargado', pantallas: ['/compras/'],
    palabras: 'borrar eliminar error equivocado corregir anular',
    pasos: [
      'Abrí la compra desde la lista de Compras.',
      'Tocá "Anular" y escribí el motivo.',
      'La compra no se borra: queda tachada, con tu nombre y el motivo, y se descuenta del stock lo que había sumado.',
      'Si estaba mal, cargala de nuevo bien.',
    ],
  },
  {
    id: 'proveedores', area: 'Compras', titulo: 'Agregar o editar un proveedor', pantallas: ['/proveedores'],
    palabras: 'proveedor cuit telefono datos reciclador',
    pasos: [
      'En Compras › Proveedores tocá "Nuevo proveedor", o tocá uno de la lista para editarlo.',
      'Completá nombre, CUIT, teléfono y qué te vende (cartón, tinta, aglutinante u otro).',
      'En la ficha ves cuánto se le compró en total, con factura y sin factura.',
    ],
  },
  {
    id: 'materia-prima', area: 'Planta', titulo: 'Ver y corregir el stock de materia prima', pantallas: ['/materia-prima'],
    palabras: 'stock inventario conteo corregir ajuste minimo dias alcanza carton tinta',
    pasos: [
      'En Planta › Materia prima ves cuánto hay de cada cosa y para cuántos días alcanza según lo que se viene usando.',
      'Tocá una para ver todos sus movimientos: compras, producción y correcciones.',
      'Si el conteo físico no coincide, tocá "Corregir stock", elegí sumar o restar, la cantidad y el motivo.',
      'En "Editar datos" ponés el stock mínimo y con cuántos días de anticipación avisar que hay que comprar.',
    ],
  },
  {
    id: 'parte', area: 'Planta', titulo: 'Cargar el parte de producción de un turno', pantallas: ['/produccion'],
    palabras: 'parte turno maquina mp-1 mp-2 paquetes pulpeadas horas operarios produccion',
    pasos: [
      'Al terminar el turno, desde Inicio tocá "Parte de producción".',
      'Elegí el turno (mañana o tarde) y, si es de otro día, la fecha.',
      'Elegí la máquina y el maple que se hizo. Si se cambió de color en el turno, cargá un parte por cada código.',
      'Marcá quiénes trabajaron.',
      'Anotá las horas que anduvo la máquina (7,5 o 7:30) y las pulpeadas.',
      'Anotá los paquetes de 60 que salieron. Te muestra cuántos debería haber hecho la máquina.',
      'Revisá la materia prima usada: viene calculada por la receta. Corregí solo lo que se usó distinto.',
      'Tocá "Guardar parte": los paquetes entran al stock y se descuenta la materia prima.',
    ],
  },
  {
    id: 'planilla', area: 'Planta', titulo: 'Leer la planilla de producción', pantallas: ['/produccion'],
    palabras: 'rendimiento promedio paquetes por hora consumo desvio receta planilla',
    pasos: [
      'En Planta › Producción elegí el período (hoy, 7 días, 30 días o las fechas que quieras).',
      'Arriba: paquetes, maples, horas de máquina y paquetes por hora.',
      '"Por máquina y maple" muestra el rendimiento contra lo que debería hacer la máquina (verde: bien; amarillo o rojo: revisar).',
      '"Materia prima usada" compara lo usado contra la receta: un + en rojo es que se gastó de más.',
      'Con "Exportar a Excel" bajás los partes del período.',
    ],
  },
  {
    id: 'palet', area: 'Planta', titulo: 'Armar un palet e imprimir su etiqueta', pantallas: ['/palets'],
    palabras: 'palet pallet etiqueta qr imprimir armar camion chasis acoplado altura',
    pasos: [
      'Desde Inicio tocá "Armar palet".',
      'Elegí el maple: al lado ves cuántos paquetes hay sueltos.',
      'Elegí en qué lo buscan (camioneta, chasis, acoplado o camión térmico): te sugiere la altura. Ajustá ancho, largo y alto con + y −.',
      'Si ya sabés para quién es, anotalo.',
      'Tocá "Armar palet" y después "Imprimir etiqueta". Pegala en el film del palet.',
      'Los paquetes se toman de la producción más vieja primero, y el QR guarda de qué turnos salió.',
    ],
  },
  {
    id: 'qr', area: 'Planta', titulo: 'Ver la historia de un palet escaneando su QR', pantallas: ['/palets/'],
    palabras: 'qr escanear camara trazabilidad historia lote origen',
    pasos: [
      'Abrí la cámara del iPhone y apuntá a la etiqueta del palet; tocá el aviso que aparece.',
      'Ves qué maple es, cuándo y quién lo produjo, con qué máquina, qué materia prima se usó y de qué proveedor vino.',
      'Si ya se vendió, ves a quién, quién lo retiró y en qué vehículo.',
      'Si todavía está en planta, tenés el botón "Despachar este palet".',
    ],
  },
  {
    id: 'despacho', area: 'Ventas', titulo: 'Despachar palets (vender)', pantallas: ['/ventas'],
    palabras: 'venta vender despacho camion escanear qr remito cliente retira chofer patente',
    pasos: [
      'Cuando llega el camión del cliente, desde Inicio tocá "Despachar palets".',
      'Apuntá la cámara a la etiqueta de cada palet que sube: se van sumando abajo. Si una no se lee, usá la pestaña "Lista".',
      'Elegí el cliente (o agregalo si es nuevo).',
      'Anotá quién se lo lleva, el vehículo y la patente.',
      'Revisá el precio por maple: viene el del cliente o el de lista.',
      'Marcá si lleva factura, revisá y tocá "Confirmar despacho".',
      'Que firme quien retira: pasale el teléfono o el iPad y firma con el dedo. Si no, imprimí el remito y que firme en papel.',
      'Los palets quedan vendidos. Si se llevan paquetes sueltos (sin palet), en el primer paso tocá "+ Paquetes sueltos".',
      'Si el cliente tenía un pedido, el sistema te pregunta si la carga es de ese pedido.',
    ],
  },
  {
    id: 'pedidos', area: 'Ventas', titulo: 'Cargar un pedido de un cliente', pantallas: ['/pedidos'],
    palabras: 'pedido encargo reserva cliente pide entrega fecha comprometido',
    pasos: [
      'Cuando un cliente encarga maples, en Ventas › Pedidos tocá "Nuevo pedido".',
      'Elegí el cliente, qué maples y cuántos (en palets o en paquetes): te avisa si hay stock o falta producir.',
      'Poné para cuándo es y en qué vehículo lo buscan.',
      'Los pedidos aparecen en Inicio cuando están por vencer. Para entregarlo, abrilo y tocá "Despachar".',
      'Se cierra solo cuando se entregó todo. Puede entregarse en varios viajes.',
      'En Stock y palets ves cuánto está comprometido en pedidos.',
    ],
  },
  {
    id: 'firma', area: 'Ventas', titulo: 'Firma del remito en pantalla', pantallas: ['/ventas/'],
    palabras: 'firma firmar remito dedo pantalla conformidad retira',
    pasos: [
      'Al despachar, el penúltimo paso es la firma: quien retira firma con el dedo en el recuadro.',
      'Si no firmó en el momento, abrí el remito y tocá "Firmar en pantalla".',
      'La firma queda guardada en el remito y sale al imprimirlo.',
    ],
  },
  {
    id: 'anular-venta', area: 'Ventas', titulo: 'Anular un despacho', pantallas: ['/ventas/'],
    palabras: 'anular venta remito error devolucion',
    pasos: [
      'Abrí el remito desde Ventas › Despachos.',
      'Tocá "Anular" y escribí el motivo.',
      'Los palets vuelven a quedar disponibles y se descuenta de la cuenta del cliente.',
    ],
  },
  {
    id: 'clientes', area: 'Ventas', titulo: 'Clientes y precios especiales', pantallas: ['/clientes'],
    palabras: 'cliente granja precio especial descuento telefono whatsapp',
    pasos: [
      'En Ventas › Clientes tocá "Nuevo cliente" o uno de la lista.',
      'Cargá el teléfono: con él funciona el botón de WhatsApp de los avisos.',
      'En "Precios especiales" elegí un maple y poné el precio por maple que se le cobra a este cliente.',
      'Arriba de la lista están los clientes para contactar. "Ya lo contacté" lo oculta una semana.',
    ],
  },
  {
    id: 'precios', area: 'Ventas', titulo: 'Cambiar la lista de precios', pantallas: ['/precios'],
    palabras: 'precio lista aumento actualizar maple paquete',
    pasos: [
      'En Ventas › Precios tocá el precio del maple que querés cambiar.',
      'Escribí el precio por maple sin IVA y tocá "Guardar". Debajo ves cuánto queda el paquete.',
      'Los clientes con precio especial siguen con el suyo.',
    ],
  },
  {
    id: 'cobro', area: 'Plata', titulo: 'Registrar un cobro de un cliente', pantallas: ['/cuentas', '/dinero'],
    palabras: 'cobrar cobro pago cliente efectivo transferencia mercado pago echeq cheque deuda',
    pasos: [
      'Desde Inicio "Registrar cobro", o en la cuenta del cliente, "Registrar cobro".',
      'Elegí el cliente y anotá el monto. Podés tocar "Todo el saldo".',
      'Elegí cómo pagó: efectivo, transferencia, Mercado Pago, e-Cheq o cheque.',
      'Si es cheque o e-Cheq: banco, número y fecha de cobro. Así aparece en la lista de cheques.',
      'Guardá: se descuenta de lo que debe el cliente.',
    ],
  },
  {
    id: 'pago', area: 'Plata', titulo: 'Registrar un pago a un proveedor', pantallas: ['/cuentas', '/dinero'],
    palabras: 'pagar pago proveedor transferencia cheque deuda',
    pasos: [
      'En Plata › Cuentas corrientes tocá "Registrar pago", o entrá a la cuenta del proveedor.',
      'Elegí el proveedor, el monto y el medio. Si es cheque, completá banco, número y fecha.',
      'Guardá: se descuenta de lo que le debemos.',
    ],
  },
  {
    id: 'cuentas', area: 'Plata', titulo: 'Cuentas corrientes, cheques y bancos', pantallas: ['/cuentas'],
    palabras: 'saldo deuda cuenta corriente cheques vencimiento rechazado banco',
    pasos: [
      'En Plata › Cuentas corrientes elegí Clientes o Proveedores: ves cuánto debe o se le debe a cada uno.',
      'Tocá uno para ver todos los movimientos con el saldo después de cada uno.',
      'Si un cheque vino rechazado, anulá ese cobro con el motivo: vuelve a sumar a la deuda.',
      'Abajo están los cheques: los que te dieron los clientes quedan "en cartera" hasta que los depositás (botón "Depositado") o se los das a un proveedor.',
      'Para pagarle a un proveedor con un cheque de un cliente: Registrar pago › Cheque de terceros › elegí el cheque. Si después vuelve rechazado, anulá ese pago y el cheque vuelve a la cartera.',
    ],
  },
  {
    id: 'gasto', area: 'Plata', titulo: 'Cargar un gasto con la foto del ticket', pantallas: ['/gastos'],
    palabras: 'gasto ticket foto comprobante impuesto servicio luz sueldo adelanto',
    pasos: [
      'Desde Inicio "Cargar gasto", o en Plata › Gastos.',
      'Elegí de qué es (impuestos, servicios, sueldos, mantenimiento…).',
      'Anotá el monto y qué se pagó. Si es sueldo o adelanto, elegí a quién.',
      'Elegí cómo se pagó. Si fue con caja chica, se descuenta solo de la caja.',
      'Tocá "Sacar foto" y fotografiá el ticket o la factura.',
      'Revisá y guardá.',
    ],
  },
  {
    id: 'caja', area: 'Plata', titulo: 'Caja chica: reponer y contar', pantallas: ['/caja'],
    palabras: 'caja chica efectivo reponer arqueo contar faltante sobrante',
    pasos: [
      'En Plata › Caja chica ves cuánto tiene que haber.',
      '"Reponer caja": cuánta plata se puso.',
      '"Contar la caja": anotá cuánto contaste. El sistema te dice si sobra o falta y deja registrada la diferencia.',
    ],
  },
  {
    id: 'tablero', area: 'Tablero', titulo: 'Leer el tablero del dueño', pantallas: ['/tablero'],
    palabras: 'tablero resultado ganancia margen costo grafico resumen mes',
    pasos: [
      'Elegí el período: este mes, el pasado, los últimos 30 días o el año.',
      'Arriba: lo vendido, comprado, gastado y el resultado (ventas menos compras y gastos).',
      'Debajo: lo que nos deben, lo que debemos, la caja chica y los palets listos.',
      'El gráfico muestra entradas y salidas por día o semana; tocá una barra para ver los montos.',
      '"Costo y margen" dice cuánto cuesta en materia prima cada maple y cuánto deja cada cliente.',
      '"Descargar el período" baja todo en un .zip para el contador.',
      '"Resumen del día" arma un resumen de ventas, producción, plata y avisos para mandar por WhatsApp. Para recibirlo solo cada noche por mail, cargá los mails en Ajustes › Equipo › Datos de la empresa.',
    ],
  },
  {
    id: 'maples', area: 'Ajustes', titulo: 'Crear un código de maple con su color y receta', pantallas: ['/maples'],
    palabras: 'codigo maple color receta consumo por hora maquina variante nuevo',
    pasos: [
      'En Ajustes › Maples y recetas tocá "Nuevo código".',
      'Elegí el color: el maple 3D se pinta para que lo veas. Si no está, tocá "Otro".',
      'Elegí tamaño, código (por ejemplo MGR-AZU), nombre y máquina.',
      'Anotá cuántos maples por hora hace la máquina.',
      'En la receta agregá cada materia prima con su consumo por hora.',
      'Guardá. Desde ahora aparece al cargar partes.',
    ],
  },
  {
    id: 'service', area: 'Ajustes', titulo: 'Service de las máquinas', pantallas: ['/maples'],
    palabras: 'service mantenimiento maquina horas aviso mp-1 mp-2 reparacion',
    pasos: [
      'En Ajustes › Maples y recetas, en Máquinas, tocá la máquina y poné cada cuántas horas le toca service.',
      'Las horas se cuentan solas con los partes de producción. Cuando falta poco, aparece el aviso en el Inicio.',
      'Cuando se hace el service, tocá "Registrar service", la fecha y qué se hizo: el contador vuelve a cero.',
    ],
  },
  {
    id: 'horas', area: 'Planta', titulo: 'Horas trabajadas por persona', pantallas: ['/produccion'],
    palabras: 'horas empleado operario sueldo quincena pago personal asistencia',
    pasos: [
      'En Planta › Producción elegí el período (por ejemplo la quincena).',
      '"Horas por persona" suma las horas de máquina de cada parte en que figura cada uno, por turno.',
      'Si cargás el valor de la hora de cada persona (Ajustes › Equipo › Personal de planta), te muestra el estimado a pagar.',
      'Con "Exportar" lo bajás a Excel para liquidar.',
    ],
  },
  {
    id: 'equipo', area: 'Ajustes', titulo: 'Agregar personas y elegir qué puede hacer cada una', pantallas: ['/equipo'],
    palabras: 'usuario empleado permiso rol operario encargado personal planta contraseña',
    pasos: [
      'En Ajustes › Equipo y permisos tocá "Agregar persona" para darle usuario a alguien.',
      'Elegí el rol: dueño, administración, encargado u operario.',
      'En "Qué puede hacer cada rol" marcá, sección por sección, si ese rol no ve nada, solo mira, carga o puede todo.',
      'En "Personal de planta" cargás a quienes trabajan en las máquinas aunque no usen el sistema.',
      'En "Datos de la empresa" están los datos que salen en tickets, remitos y etiquetas.',
    ],
  },
  {
    id: 'instructivos', area: 'Ajustes', titulo: 'Cambiar el texto de ayuda de un paso', pantallas: ['/'],
    palabras: 'instructivo ayuda texto editar paso explicacion',
    pasos: [
      'Entrá a cualquier carga paso a paso (pesaje, parte, despacho…).',
      'En el cuadro azul de ayuda tocá el lápiz.',
      'Escribí cómo lo hacen ustedes y tocá "Guardar instructivo". Lo ven todos.',
      '"Volver al original" deja el texto de fábrica.',
    ],
  },
  {
    id: 'exportar', area: 'Ajustes', titulo: 'Exportar los datos a Excel', pantallas: ['/exportar', '/tablero'],
    palabras: 'exportar excel descargar csv contador backup respaldo reporte planilla',
    pasos: [
      'En cada listado (ventas, compras, producción, gastos, cuentas, palets) tocá "Exportar a Excel".',
      'Para todo junto: Ajustes › Exportar datos, elegí el período y "Descargar todo (.zip)".',
      'En el iPhone el archivo se guarda en la app Archivos.',
      'Los archivos se abren con Excel o Google Sheets; los montos ya vienen en pesos.',
    ],
  },
  {
    id: 'importar', area: 'Ajustes', titulo: 'Importar planillas de Excel', pantallas: ['/importar'],
    palabras: 'importar excel planilla subir cargar masivo clientes proveedores saldos stock precios csv',
    pasos: [
      'En Ajustes › Importar planillas elegí qué tiene la planilla: clientes, proveedores, stock inicial, saldos iniciales o precios.',
      'Si no sabés cómo armarla, bajá la planilla modelo y completala.',
      'Subí el Excel (.xlsx) o un CSV. Si es un Excel viejo (.xls), guardalo como .xlsx primero.',
      'Revisá qué columna es cada dato: el sistema ya propone las que se parecen por el nombre.',
      'El sistema la prueba sin guardar nada y te dice qué va a crear y qué filas tienen errores. Corregí el Excel y volvé a subirlo si hace falta.',
      'Tocá "Importar". Si la volvés a subir, no se duplica nada.',
    ],
  },
  {
    id: 'registro', area: 'Ajustes', titulo: 'Ver quién hizo cada cosa', pantallas: ['/registro'],
    palabras: 'registro auditoria historial quien cambio borro anulo',
    pasos: [
      'En Ajustes › Registro de cambios ves cada carga, edición y anulación, con la persona y la hora.',
      'Nada se borra del sistema: lo anulado queda con su motivo.',
    ],
  },
  {
    id: 'procedimientos', area: 'Primeros pasos', titulo: 'Escribir un procedimiento de la planta', pantallas: ['/ayuda'],
    palabras: 'procedimiento manual planta instructivo escribir como se hace',
    pasos: [
      'En Ayuda tocá "Nuevo procedimiento".',
      'Poné un título (por ejemplo "Limpieza del pulper") y escribí un paso por renglón.',
      'Guardá: lo pueden buscar, leer e imprimir todos.',
    ],
  },
];

export { normalizar } from './filtros';
