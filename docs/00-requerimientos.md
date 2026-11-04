# Moldeados Córdoba — Requerimientos

Sistema de gestión (ERP liviano) para una fábrica de **maples de huevo** de pulpa moldeada.
Fuente: notas de la reunión de kickoff (2026-11-03). Lo marcado **[supuesto]** es interpretación
nuestra hasta que el cliente lo confirme; lo marcado **[pregunta]** está abierto (ver §10).

---

## 1. Qué hace la fábrica (en una frase por paso)

1. **Entra materia prima.** Cartón (kg, llega con **ticket de pesaje**), tinta (litros, por color) y
   aglutinante/encolante (litros). Cada compra es a un **proveedor**, a un precio, con o sin factura.
2. **Se pulpea.** El **pulper** mezcla agua + cartón (+ colorante + aglutinante) y disgrega la fibra sin
   romperla. Unidad de trabajo: la **pulpeada** (~1 L de encolante por pulpeada).
3. **Se moldea.** Dos máquinas papeleras: **MP-1** (maple chico) y **MP-2** (maple grande). Trabajan
   en **doble turno** (mañana / tarde), igual que los empleados.
4. **Se empaqueta.** Paquetes de **60 maples**. Se arman **palets** (ej. 2 × 3 × 6 paquetes; la altura
   varía 4/6/8 según el pedido y el vehículo del cliente).
5. **Se vende.** Solo se venden maples, por palet, a clientes. Se cobra y se lleva cuenta corriente.
6. **Se gasta.** Caja chica, impuestos, servicios, empleados.

## 2. Productos (maples)

Cada **variante** de maple es un **código** configurable desde el panel:

| Tamaño | Color | Ejemplo de código |
|---|---|---|
| Chico (MP-1) | Sin color (cartón natural) | `MCH-NAT` |
| Chico (MP-1) | Con color (cualquiera: rojo, etc.) | `MCH-ROJ` |
| Grande (MP-2) | Sin color | `MGR-NAT` |
| Grande (MP-2) | Con color | `MGR-ROJ` |

Los colores son libres (se dan de alta). Cada variante tiene su **receta de consumo por hora de máquina**:

> Ej. maple grande de color: 12 L/h de tinta, 5 L/h de aglutinante, X kg/h de cartón → produce N maples/h.

Con esa receta el sistema calcula el **consumo teórico** de cada parte de producción y lo compara contra
lo real (desvío = el número que le importa al dueño).

## 3. Materia prima y proveedores

| Materia prima | Unidad | Factura | Proveedores |
|---|---|---|---|
| Cartón | kg | A veces sí, a veces no (en blanco / en negro) | Recicladores, **supermercados** |
| Tinta (por color) | litros | Siempre | Proveedores de tinta |
| Aglutinante / encolante | litros | Siempre | Proveedores de aglutinante |

- **Ingreso de cartón = ticket de pesaje** (bruto, tara, neto, proveedor, precio/kg). Genera la compra,
  suma stock y suma a la **cuenta corriente del proveedor**.
- Toda compra queda con: proveedor, cantidad, precio, **con/sin factura** (y nro. si tiene).
- **Pagos a proveedores**: efectivo · transferencia · Mercado Pago · **e-cheq** (registrando el banco:
  Patagonia, Santander, Galicia, Macro, Bancor — lista editable) · **cheque físico** (banco, número,
  fecha de cobro). Todo pago impacta la cuenta corriente.

## 4. Producción — "la planilla productiva"

Un **parte de producción** por máquina y turno:

- fecha, turno (mañana/tarde), máquina, variante de maple, operarios, horas trabajadas, pulpeadas
- **producido**: paquetes de 60
- **consumido**: lo calcula la receta; el operario solo corrige si fue distinto
- descuenta materia prima del stock y suma producto terminado

De ahí salen: **cuánto se usó, qué se hizo, qué se gastó, promedio de producción** (por máquina, turno,
operario, variante).

## 5. Ventas y clientes

- Cliente → pedido/venta **por palet**. Palet = paquetes de 60 × ancho × largo × alto; la altura (4/6/8)
  y el armado dependen del vehículo: **camioneta, chasis, acoplado, camión térmico**.
- Precio por variante **[supuesto: lista única, con precio especial por cliente opcional]**.
- Cobros con los mismos medios que los pagos; **cuenta corriente del cliente**.
- Venta descuenta stock de producto terminado.

## 6. Gastos

Caja chica, impuestos, servicios, empleados (sueldos/adelantos). Categoría, monto, medio de pago,
comprobante opcional (foto). **[supuesto]** No liquidamos sueldos: se registran como gasto.

## 7. Etiquetas y QR

Cada **palet / lote** producido se etiqueta con **ID + QR** para pegar. Al escanearlo con el celular se
ve todo según el rol: variante, fecha, turno, máquina, operarios, materia prima usada (y de qué
proveedor), a quién se vendió. **[pregunta]** ¿El QR va por palet, por paquete o por variante?

## 8. Roles, permisos y trazabilidad

- **Login** propio. Roles iniciales **[supuesto]**: Dueño/Admin · Administración (compras, pagos, ventas,
  gastos) · Encargado de planta (producción, pesaje, stock) · Operario (carga su parte y escanea).
- Permisos por módulo (ver / cargar / editar / anular), editables desde el panel.
- **Todo queda registrado**: quién, cuándo, qué cambió (antes/después). Nada se borra: se **anula** con motivo.

## 9. Instructivos

Cada proceso (pesaje, parte de producción, venta, pago…) tiene su **instructivo dentro de la pantalla**:
pasos numerados, uno a la vez. El sistema es **procedimental**: un asistente paso a paso, no un formulario
largo. Instructivos editables desde el panel.

## 10. Decisiones del cliente (2026-11-03)

1. "Bendecido 5k de cajón": descartado (nota sin significado recuperable).
2. **QR por palet**, trazable hacia atrás: palet → partes de producción (fecha, turno, máquina, operarios)
   → materia prima consumida → compras/pesajes de origen; y hacia adelante: a qué cliente se vendió.
3. **Todo configurable**: maples/hora, consumos por hora y kg de cartón los carga la fábrica en cada receta.
4. **Precios**: lista única por variante + precio especial por cliente (opcional). Ambos con **IVA opcional**
   (alícuota por venta).
5. **Sin ARCA**: compras y ventas solo registran si van **con factura o sin factura** (+ número si tiene).

## 11. Dominio

La web actual (`moldeadoscordoba.com.ar`) no es nuestra. Opciones, en orden:

1. **Subdominio** `sistema.moldeadoscordoba.com.ar`: el cliente (o quien maneja su DNS) agrega **un registro
   A** apuntando a nuestro VPS. No toca su web. **Recomendado.**
2. Dominio propio nuevo (ej. `moldeadoscba.com.ar` en NIC Argentina) si no consiguen acceso al DNS.

## 12. Roadmap por cortes

| Corte | Qué | Valor |
|---|---|---|
| 1 **(hecho)** | Login, roles/permisos, auditoría · proveedores · materias primas · **ticket de pesaje** · compras · stock MP | Ya registran lo que entra |
| 2 **(hecho)** | Variantes de maple + recetas · máquinas · **parte de producción por turno** · stock producto terminado · etiquetas QR | La planilla productiva |
| 3 **(hecho)** | Clientes · ventas por palet · cobros · cuentas corrientes (clientes y proveedores) · pagos con cheques/e-cheq | La plata |
| 4 | Gastos/caja chica · **dashboards** (compras por proveedor, ventas por cliente, producción, consumo real vs teórico, gastos) | El tablero del dueño |
| 5 | Instructivos editables · escaneo QR desde celular por rol | Pulido |
