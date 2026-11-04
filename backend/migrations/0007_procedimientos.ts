import type { Knex } from 'knex';

// Procedimientos de planta: cómo se hace cada cosa en la fábrica (no en el sistema). Los escribe el dueño o el
// encargado; un paso por renglón. Arranca con el proceso del maple, para que lo ajusten a cómo trabajan ellos.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('procedimientos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('titulo').notNullable();
    t.text('resumen');
    t.text('pasos').notNullable(); // un paso por renglón
    t.integer('orden').notNullable().defaultTo(0);
    t.uuid('usuario_id').references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at', { useTz: true });
  });
  await knex('procedimientos').insert({
    titulo: 'Cómo se hace un maple de huevo',
    resumen: 'De la llegada del cartón al palet despachado. Versión de partida: ajústenla a cómo trabajan en la planta.',
    orden: 0,
    pasos: [
      'Recepción del cartón: el camión entra a la báscula, se pesa cargado (bruto), descarga y se pesa vacío (tara). Se registra el pesaje en el sistema.',
      'Clasificación: se separa el cartón de plásticos, cintas, metales y papel plastificado, que no se deshacen en el pulper.',
      'Pulpeado: en el pulper se cargan agua y cartón. La máquina disgrega la fibra sin romperla hasta formar una pulpa pareja. Se agrega el encolante (aglutinante, alrededor de 1 litro por pulpeada) y, si el maple es de color, la tinta.',
      'Control de la pulpa: se revisa que la pasta no tenga grumos ni restos y que la consistencia sea la de siempre. Una pulpa muy aguada da maples finos; muy espesa, maples pesados que tardan en secar.',
      'Moldeado: la papelera (MP-1 para maple chico, MP-2 para grande) sumerge el molde de malla en la pulpa y por vacío la fibra se pega con la forma del maple. Se escurre el agua, que vuelve al circuito.',
      'Transferencia: el maple húmedo pasa del molde a la bandeja de secado.',
      'Secado: los maples se secan hasta perder la humedad. Un maple mal secado se deforma o junta hongos en el depósito.',
      'Control de calidad: se descartan maples rotos, con agujeros, deformados o con el color desparejo. El descarte vuelve al pulper.',
      'Empaquetado: se apilan y atan paquetes de 60 maples.',
      'Parte de producción: al terminar el turno se carga en el sistema qué máquina, qué maple, quiénes trabajaron, horas, pulpeadas y paquetes.',
      'Paletizado: se arman los palets (por ejemplo 2 × 3 × 6 paquetes; la altura cambia según el vehículo del cliente), se filman y se pega la etiqueta con el QR que genera el sistema.',
      'Despacho: cuando el cliente retira, se escanea el QR de cada palet, se anota quién se lo lleva y en qué vehículo, y se imprime el remito para firmar.',
    ].join('\n'),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('procedimientos');
}
