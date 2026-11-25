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
    palabras: 'login usuario contraseña clave olvidé olvide recuperar codigo mail sesión cerrar',
    pasos: [
      'Entrá con tu usuario y tu contraseña. El sistema recuerda el último usuario que entró en ese teléfono.',
      'Para salir, abrí el menú (en el iPhone, "Más" abajo a la derecha) y tocá "Salir" abajo de todo.',
      '¿Te olvidaste la contraseña? En la pantalla de entrada tocá "¿Olvidaste tu contraseña?", escribí tu usuario o tu mail y te llega un código de 6 números. Con el código elegís una contraseña nueva y entrás.',
      'Para que funcione, tu usuario tiene que tener un mail cargado (Ajustes › Equipo y permisos). Si no tiene, quien administra el sistema te puede poner una contraseña nueva desde ahí.',
      'La sesión dura una semana y se renueva sola cada vez que abrís el sistema: si lo usás seguido, no te vuelve a pedir la contraseña.',
    ],
  },
  {
    id: 'sin-senal', area: 'Primeros pasos', titulo: 'Trabajar sin señal', pantallas: ['/'],
    palabras: 'sin señal internet offline conexion wifi datos playon guardado telefono subir',
    pasos: [
      'Abrí el sistema al menos una vez con señal en cada teléfono o iPad: queda guardado lo necesario para trabajar sin conexión.',
      'Sin señal podés cargar producciones de cada turno, ventas (escaneando los palets) y entradas de cartón. Arriba aparece un aviso amarillo.',
      'Lo que cargás queda guardado en el teléfono y se sube solo cuando vuelve la señal. No hace falta hacer nada.',
      'Si al subirse el sistema rechaza algo (por ejemplo, ese palet ya lo había vendido otra persona), aparece en rojo con el motivo para revisarlo.',
      'Armar palets, cobrar y lo administrativo necesitan señal.',
    ],
  },
  {
    id: 'buscar', area: 'Primeros pasos', titulo: 'Buscar cualquier cosa', pantallas: ['/'],
    palabras: 'buscar buscador encontrar lupa atajo comando cliente remito numero',
    pasos: [
      'En el iPhone tocá "Buscar" en la barra de abajo. En el iPad y la computadora está arriba de todo en el menú, y también abre con ⌘K o Ctrl+K.',
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
    id: 'inicio', area: 'Primeros pasos', titulo: 'Hoy: el día en una pantalla', pantallas: ['/'],
    palabras: 'inicio tareas avisos planilla diaria dia vendido cobrado palets pallets alto stock fabrica rapido',
    pasos: [
      'Es lo primero que ves al entrar. Arriba, en botones grandes, lo de todos los días según tu puesto: "Pallet terminado" (plastificadora), "Cargar camión" (las órdenes abiertas) y "Orden de venta" (gerente).',
      'Si ves ventas o cuentas: lo vendido y lo cobrado del día. Cada tarjeta se toca y lleva al detalle.',
      '"Para cargar": las órdenes de venta abiertas, con cuántos pallets van cargados. Tocá una para abrir la pantalla de carga.',
      'Después: lo que hay en la fábrica por tipo y alto (cuántos pallets de 7, de 6, de 5 y de 4), los pallets de hoy y lo vendido.',
      'Entró cartón, tinta o aglutinante: tocalo en "Materia prima", elegí el proveedor (o "Proveedor nuevo") y completá cantidad, precio y Cuenta 1 o Cuenta 2. Ahí también se corrige lo que hay de verdad.',
      'Para mirar otro día, tocá "Otro día" arriba.',
      'Arriba a la derecha, la campana: primero lo urgente (stock agotado, atrasos, cheques), cada cosa con su botón para resolverla; después los recordatorios y los pedidos nuevos.',
    ],
  },

  {
    id: 'pesaje', area: 'Compras', titulo: 'Anotar un camión de cartón que llegó', pantallas: ['/pesaje', '/compras'],
    palabras: 'bascula balanza ticket bruto tara neto carton camion reciclador supermercado',
    pasos: [
      'Desde Inicio tocá "Entrada de cartón" (o en Compras, el botón "Entrada de cartón").',
      'Elegí el proveedor. Si es nuevo, tocá "Es un proveedor nuevo", escribí el nombre y seguí.',
      'Anotá el peso bruto (camión cargado) y la tara (camión vacío). El sistema calcula el neto. Podés escribir 8.420 o 8420.',
      'Revisá el precio por kilo: viene el de la última compra a ese proveedor.',
      'Marcá si va a Cuenta 1 o a Cuenta 2, y el IVA si corresponde.',
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
      'Marcá Cuenta 1 o Cuenta 2 y la alícuota de IVA.',
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
      'En la ficha ves cuánto se le compró en total, en Cuenta 1 y en Cuenta 2.',
    ],
  },
  {
    id: 'materia-prima', area: 'Planta', titulo: 'Ver y corregir el stock de materia prima', pantallas: ['/materia-prima'],
    palabras: 'stock inventario conteo corregir ajuste minimo dias alcanza carton tinta',
    pasos: [
      'En Planta › Materia prima ves cuánto hay de cada cosa y para cuántos días alcanza según lo que se viene usando.',
      'Tocá una para ver sus movimientos. Ahí mismo: "Anotar que entró" (elegís el proveedor o "Proveedor nuevo") o "Corregir lo que hay".',
      'Si el conteo físico no coincide, tocá "Corregir lo que hay", escribí cuánto hay de verdad y confirmá.',
      'En "Editar datos" ponés el stock mínimo y con cuántos días de anticipación avisar que hay que comprar.',
    ],
  },

  {
    id: 'palet', area: 'Planta', titulo: 'Pallet terminado: cargarlo al stock e imprimir su etiqueta', pantallas: ['/palets', '/plastificar'],
    palabras: 'palet pallet etiqueta qr imprimir plastificar plastificadora film tablet alto stock terminado',
    pasos: [
      'En la tablet de la plastificadora, cuando terminás de plastificar un pallet, abrí Planta › Plastificadora (o "Pallet terminado" en Hoy).',
      'Tocá 1) el tamaño (chico o grande), 2) el color (natural o rojo), 3) el alto (4, 5, 6 o 7) y 4) Confirmar. Te muestra en grande qué vas a cargar: "Sí, cargar e imprimir". No hay nada para escribir.',
      'El pallet entra al stock en el momento y sale la etiqueta con su QR, el maple, el alto, los maples, la fecha y hora y el número de pallet. Pegala en el film.',
      'La elección queda puesta: si el siguiente es igual, solo tocás Confirmar.',
      'Cuentas: 1 paquete = 60 maples, cada camada son 6 paquetes (3 × 2). Un pallet de 7 = 42 paquetes = 2.520 maples.',
      'Si la etiqueta no salió o se rompió, tocá "Reimprimir etiqueta" (o abrí el pallet y "Imprimir etiqueta").',
      'Si un pallet se cargó por error, abrilo y tocá "Anular este pallet" (al pie). Solo lo pueden hacer el gerente o el dueño.',
      'En Planta › Stock de pallets ves lo que hay por tipo y alto.',
    ],
  },

  {
    id: 'qr', area: 'Planta', titulo: 'Ver un pallet escaneando su QR', pantallas: ['/palets/', '/escanear'],
    palabras: 'qr escanear camara trazabilidad historia etiqueta',
    pasos: [
      'En el iPhone tocá "Escanear" (abajo) y apuntá a la etiqueta del pallet. También sirve la cámara del iPhone. Si la etiqueta no se lee, escribí el número del pallet.',
      'Ves qué maple es, de qué alto, cuándo se cargó y quién. Si ya se vendió, a quién y quién lo retiró.',
    ],
  },

  {
    id: 'orden', area: 'Ventas', titulo: 'Emitir una orden de venta', pantallas: ['/ordenes', '/ventas'],
    palabras: 'venta vender orden camion cliente chofer patente remito pallets despacho gerente',
    pasos: [
      'Desde la compu del sector de carga, en Ventas › Órdenes tocá "Nueva orden". La emite el gerente (o el dueño).',
      'Elegí el cliente y el chofer: aparecen primero los choferes que cargan para ese cliente.',
      'Qué se lleva: maple, alto y cuántos pallets. Lo normal es un renglón (ej.: 20 MCH-ROJ de 7); con "Otro renglón" agregás más (ej.: + 10 MGR-NAT de 6).',
      'El precio lo trae la ficha del cliente. La condición de pago también (Cuenta 1, Cuenta 2 o Mixta); se puede cambiar solo para esta orden.',
      'Tocá "Revisar y emitir": ves el resumen (cliente, chofer, qué se lleva, condición y total) y confirmás con "Sí, emitir orden". Si un maple no tiene precio o no alcanza el stock, te avisa antes.',
    ],
  },
  {
    id: 'carga', area: 'Ventas', titulo: 'Cargar el camión con la pistola QR', pantallas: ['/ordenes/'],
    palabras: 'carga camion pistola lector qr escanear mulero orden contador cerrar cancelar imprimir duplicado chofer firma',
    pasos: [
      'Abrí la orden (Hoy › Para cargar, o Ventas › Órdenes). La pantalla queda lista para la pistola.',
      'A medida que sube cada pallet, escanealo. Suena un OK y el contador del renglón sube (ej.: "MCH-ROJ de 7: 8 de 10").',
      'Si no corresponde (otro tamaño, color o alto), si ese renglón ya está completo, si el pallet ya se vendió o ya se escaneó, o si el QR no existe, suena un error y lo dice en grande.',
      'Con el último pallet la orden se cierra sola: descuenta los pallets del stock, registra la venta (pendiente de cobro) e imprime la orden por duplicado: el original lo firma el chofer, el duplicado queda en la fábrica.',
      'Si en el camión entran menos de lo pedido, el gerente toca "Cerrar con lo cargado" (abajo de todo, en "Si el camión no se lleva todo") y confirma. El mulero no lo ve.',
      'Si el camión no se lleva nada, el gerente toca "Cancelar orden": los pallets escaneados vuelven al stock.',
    ],
  },
  {
    id: 'cuenta2', area: 'Ventas', titulo: 'Cuenta 1, Cuenta 2 y Mixta', pantallas: ['/ventas', '/clientes'],
    palabras: 'cuenta 1 cuenta 2 mixta condicion de pago porcentaje',
    pasos: [
      'Cada cliente tiene su condición de pago: Cuenta 1, Cuenta 2 o Mixta (con el porcentaje que va a Cuenta 1, ej.: 10% a Cuenta 1 y 90% a Cuenta 2).',
      'Al cerrar una orden, lo de Cuenta 1 va a Ventas y lo de Cuenta 2 al sector "Cuenta 2". Si es Mixta, se reparte según el porcentaje.',
      'En Ventas, arriba, elegís "Cuenta 1" o "Cuenta 2" para ver cada una.',
      'Lo de Cuenta 1 lleva IVA 21% sobre el precio acordado.',
    ],
  },

  {
    id: 'agenda', area: 'Primeros pasos', titulo: 'Agenda y recordatorios para el equipo', pantallas: ['/agenda', '/'],
    palabras: 'recordatorio recordar tarea pendiente calendario agenda mes mensual aviso alarma avisar equipo empleados personas',
    pasos: [
      'Abrí la Agenda desde Inicio (arriba, "Agenda") o desde la campana.',
      'Tocá "Nuevo recordatorio": escribí qué hay que hacer, el día y, si importa, la hora.',
      'Elegí si se repite (todos los días, cada semana o cada mes) y para quién es: solo vos, algunas personas o todo el equipo.',
      'A cada persona le aparece en su agenda y en el inicio, y le llega un aviso a la hora (sin hora, a las 8).',
      'Cuando alguien lo hace, toca el círculo: queda hecho para todos y a quien lo creó le llega el aviso.',
      'Lo que pasó de fecha sin hacer aparece en rojo como "Atrasado". Para cambiarlo o borrarlo, tocá el lápiz.',
      'Vista "Mes": un calendario con lo de cada día (en el teléfono, puntitos: azul pendiente, rojo atrasado, verde hecho). Tocá un día para ver el detalle o "Agendar este día". Con las flechas pasás de mes.',
      'El dueño puede ver la agenda de otras personas: arriba, en "Ver la agenda de", tocá una o varias, o "Todo el equipo".',
    ],
  },
  {
    id: 'avisos', area: 'Primeros pasos', titulo: 'Avisos: la campana y los avisos en el teléfono', pantallas: ['/'],
    palabras: 'notificaciones campana avisos push alertas celular sonido aviso nuevo',
    pasos: [
      'La campana (arriba) muestra cuántas cosas tenés para ver: arriba lo urgente para atender (stock agotado, atrasos, cheques) y abajo los recordatorios que tocan, lo que te agendaron y los pedidos nuevos.',
      'Los avisos llegan al instante con la app abierta y asoman abajo unos segundos; tocalos para ir a lo que dicen.',
      'Para que lleguen con la app cerrada: abrí la campana y tocá "Activar avisos". En iPhone primero hay que agregar el sistema a la pantalla de inicio y abrirlo desde el ícono.',
      'Si alguien más usa el mismo teléfono, al salir de tu usuario dejan de llegarte ahí.',
    ],
  },
  {
    id: 'pedidos', area: 'Ventas', titulo: 'Cargar un pedido de un cliente', pantallas: ['/pedidos'],
    palabras: 'pedido encargo reserva cliente pide entrega fecha comprometido',
    pasos: [
      'Cuando un cliente encarga maples, en Ventas › Pedidos tocá "Nuevo pedido".',
      'Elegí el cliente, qué maples y cuántos (en palets o en paquetes): te avisa si hay stock o falta producir.',
      'Poné para cuándo es y en qué vehículo lo buscan.',
      'Los pedidos aparecen en Inicio cuando están por vencer. Para entregarlo, abrilo y tocá "Hacer orden de venta": ya viene con el cliente y lo que falta. Cuando se carga el camión, el pedido descuenta lo entregado solo.',
      'Se cierra solo cuando se entregó todo. Puede entregarse en varios viajes.',
      'En Stock y palets ves cuánto está comprometido en pedidos.',
    ],
  },
  {
    id: 'firma', area: 'Ventas', titulo: 'Firma del remito en pantalla', pantallas: ['/ventas/'],
    palabras: 'firma firmar remito dedo pantalla conformidad retira',
    pasos: [
      'Al vender, el penúltimo paso es la firma: quien retira firma con el dedo en el recuadro.',
      'Si no firmó en el momento, abrí el remito y tocá "Firmar en pantalla".',
      'La firma queda guardada en el remito y sale al imprimirlo.',
    ],
  },
  {
    id: 'anular-venta', area: 'Ventas', titulo: 'Anular una venta', pantallas: ['/ventas/'],
    palabras: 'anular venta remito error devolucion',
    pasos: [
      'Abrí el remito desde Ventas.',
      'Tocá "Anular" y escribí el motivo.',
      'Los palets vuelven a quedar disponibles y se descuenta de la cuenta del cliente.',
    ],
  },
  {
    id: 'clientes', area: 'Ventas', titulo: 'Clientes: precio acordado y condición de pago', pantallas: ['/clientes'],
    palabras: 'cliente granja precio acordado especial condicion de pago cuenta 1 cuenta 2 mixta tabla telefono whatsapp',
    pasos: [
      'En Ventas › Clientes tocá "Nuevo cliente" o uno de la lista.',
      'Precio acordado: ponele el precio por maple de cada tipo (MCH-NAT, MCH-ROJ, MGR-NAT, MGR-ROJ). Si lo dejás vacío, se le cobra el de lista.',
      'Condición de pago: Cuenta 1, Cuenta 2 o Mixta (y el porcentaje que va a Cuenta 1).',
      'Arriba, "Precios y condición" muestra todos los clientes juntos en una tabla.',
      'Cargá el teléfono: con él funciona el botón de WhatsApp de los avisos.',
    ],
  },
  {
    id: 'choferes', area: 'Ventas', titulo: 'Cargar los choferes', pantallas: ['/choferes'],
    palabras: 'chofer camionero dni patente vehiculo camioneta chasis acoplado termico retira',
    pasos: [
      'En Ventas › Choferes tocá "Nuevo chofer".',
      'Nombre y apellido, DNI, teléfono, patente y tipo de vehículo (camioneta, chasis, acoplado o térmico).',
      'En "Carga para" tocá los clientes para los que retira: puede ser más de uno.',
      'Para editarlo o darlo de baja, tocalo en la lista.',
    ],
  },

  {
    id: 'precios', area: 'Ajustes', titulo: 'Cambiar la lista de precios', pantallas: ['/precios'],
    palabras: 'precio lista aumento actualizar maple paquete',
    pasos: [
      'En Ajustes › Precios (al lado de Maples y máquinas) tocá el precio del maple que querés cambiar.',
      'Escribí el precio por maple sin IVA y tocá "Guardar". Debajo ves cuánto queda el paquete.',
      'Los clientes con precio especial siguen con el suyo.',
    ],
  },
  {
    id: 'cobro', area: 'Plata', titulo: 'Pago a cuenta de un cliente (cobro)', pantallas: ['/cuentas', '/dinero'],
    palabras: 'cobrar cobro pago a cuenta cliente efectivo transferencia mercado pago echeq cheque deuda saldo',
    pasos: [
      'En Plata › Saldos, tocá "Cobrar" al lado del cliente que debe (o "Pago a cuenta" arriba). La lista pone primero a los que deben.',
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
      'En Plata › Saldos tocá "Pagar a proveedor", o entrá al saldo del proveedor.',
      'Elegí el proveedor, el monto y el medio. Si es cheque, completá banco, número y fecha.',
      'Guardá: se descuenta de lo que le debemos.',
    ],
  },
  {
    id: 'cuentas', area: 'Plata', titulo: 'Saldos de clientes y proveedores, cheques y bancos', pantallas: ['/cuentas'],
    palabras: 'saldo saldos de clientes deuda cuenta corriente total vendido total pagado cheques vencimiento rechazado banco',
    pasos: [
      'En Plata › Saldos elegí Clientes o Proveedores: de cada uno, el total vendido (o comprado), el total pagado y el saldo.',
      'Tocá uno para ver todos los movimientos con el saldo después de cada uno.',
      'Si un cheque vino rechazado, anulá ese cobro con el motivo: vuelve a sumar a la deuda.',
      'Abajo están los cheques: los que te dieron los clientes quedan "en cartera" hasta que los depositás (botón "Depositado") o se los das a un proveedor.',
      'Para pagarle a un proveedor con un cheque de un cliente: Pagar a proveedor › Cheque de terceros › elegí el cheque. Si después vuelve rechazado, anulá ese pago y el cheque vuelve a la cartera.',
    ],
  },
  {
    id: 'gasto', area: 'Plata', titulo: 'Cargar un egreso (pagado o pendiente)', pantallas: ['/egresos'],
    palabras: 'egreso gasto ticket foto comprobante impuesto f-931 iva arca servicio ecogas epec luz agua sueldo adelanto expensas alquiler pallets pendiente vencimiento dolares',
    pasos: [
      'Desde Inicio "Cargar egreso", o en Plata › Egresos.',
      'Elegí la categoría (sueldos, impuestos, Ecogas, mantenimiento, pallets…).',
      'Anotá el monto, el concepto y el proveedor / beneficiario. Si es sueldo o adelanto, elegí a quién. Si se pagó en dólares, anotá también el monto en US$.',
      '¿Ya se pagó? Pagado: elegí la forma de pago (con caja chica se descuenta sola). Pendiente: poné el vencimiento y el sistema avisa 3 días antes.',
      'Tocá "Sacar foto" y fotografiá el ticket o la factura; anotá el N° de comprobante si tiene.',
      'Cuando se paga uno pendiente: en Egresos › "Pendientes de pago", tocalo y "Marcar pagado".',
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
    palabras: 'tablero balance resumen mensual resultado del mes saldo acumulado variacion ingresos egresos ganancia margen costo grafico calidad',
    pasos: [
      'Elegí el período: este mes, el pasado, los últimos 30 días o el año.',
      'Arriba: el resultado (ventas menos egresos), el total de ingresos, las compras de materia prima y los egresos.',
      '"Balance mensual": como en la planilla, mes por mes, total ingresos, total egresos, resultado del mes, saldo acumulado y % contra el mes anterior, más los maples producidos y vendidos.',
      '"Egresos por categoría" y "Ventas por calidad" (primera y segunda) del período.',
      'Debajo: lo que nos deben, lo que debemos, la caja chica y los palets listos.',
      'El gráfico muestra entradas y salidas por día o semana; tocá una barra para ver los montos.',
      '"Costo y margen" dice cuánto cuesta en materia prima cada maple y cuánto deja cada cliente.',
      '"Descargar el período" baja todo en un .zip para el contador.',
      '"Resumen del día" arma un resumen de ventas, producción, plata y avisos para mandar por WhatsApp. Para recibirlo solo cada noche por mail, cargá los mails en Ajustes › Equipo y permisos › Empresa.',
    ],
  },
  {
    id: 'maples', area: 'Ajustes', titulo: 'Crear un código de maple con su color y receta', pantallas: ['/maples'],
    palabras: 'codigo maple color receta consumo por hora maquina variante nuevo',
    pasos: [
      'En Ajustes › Maples y máquinas tocá "Nuevo código".',
      'Elegí el color: el maple 3D se pinta para que lo veas. Si no está, tocá "Otro".',
      'Elegí tamaño, código (por ejemplo MGR-AZU), nombre y máquina.',
      'Anotá cuántos maples por hora hace la máquina.',
      'En la receta agregá cada materia prima con su consumo por hora.',
      'Guardá. Desde ahora aparece al cargar la producción.',
    ],
  },
  {
    id: 'service', area: 'Ajustes', titulo: 'Service de las máquinas', pantallas: ['/maples'],
    palabras: 'service mantenimiento maquina horas aviso mp-1 mp-2 reparacion',
    pasos: [
      'En Ajustes › Maples y máquinas, en Máquinas, tocá la máquina y poné cada cuántas horas le toca service.',
      'Las horas se cuentan solas con la producción de cada turno. Cuando falta poco, aparece el aviso en el Inicio.',
      'Cuando se hace el service, tocá "Registrar service", la fecha y qué se hizo: el contador vuelve a cero.',
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
      'Entrá a cualquier carga paso a paso (cartón, producción, venta…).',
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
    id: 'importar-finanzas', area: 'Ajustes', titulo: 'Pasar la planilla de finanzas al sistema', pantallas: ['/importar', '/egresos'],
    palabras: 'planilla finanzas excel egresos ventas pasar migrar empezar saldos de clientes numeracion remito',
    pasos: [
      'Egresos: en Ajustes › Importar planillas elegí "Egresos" y subí la hoja EGRESOS tal cual. Las columnas se reconocen solas; probá primero y después importá. Los "Pendiente" quedan para pagar.',
      'Lo que deben los clientes al empezar: "Saldos iniciales de clientes" (cliente y saldo). Lo mismo con proveedores.',
      'Remitos: en Ajustes › Equipo y permisos › Empresa poné el próximo número de remito para seguir con la numeración de papel.',
      'Desde ahí, las ventas salen de la "Orden de venta" (se registran solas al cargar el último pallet) y los egresos con "Cargar egreso".',
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

