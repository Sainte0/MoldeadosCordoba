import type { Knex } from 'knex';

// Corte 2: máquinas, códigos de maple con su receta por hora, personal de planta, partes de producción por
// turno (descuentan materia prima) y palets con trazabilidad al lote (parte) del que salió cada paquete.
//
// Stock de maples (en paquetes) = producido en partes vigentes − vendido (Corte 3).
// En palets = paquetes asignados a palets vigentes. Sin paletizar = producido − en palets.

export async function up(knex: Knex): Promise<void> {
  const ts = (t: Knex.CreateTableBuilder, soft = true) => {
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    if (soft) t.timestamp('deleted_at', { useTz: true });
  };
  const anulable = (t: Knex.CreateTableBuilder) => {
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('anulado_at', { useTz: true });
    t.uuid('anulado_por').references('usuarios.id').onDelete('RESTRICT');
    t.text('motivo_anulacion');
    ts(t, false);
  };

  // Datos de la empresa para tickets y etiquetas (una sola fila, editable desde Equipo). Arranca con lo de su web.
  await knex.schema.createTable('empresa', (t) => {
    t.integer('id').primary().defaultTo(1);
    t.text('razon_social').notNullable();
    t.text('direccion');
    t.text('telefono');
    t.text('email');
    t.text('cuit');
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('alter table empresa add constraint empresa_unica check (id = 1)');
  await knex('empresa').insert({ razon_social: 'Moldeados Córdoba SA', direccion: 'Polo 52, Córdoba', telefono: '+54 9 351 809-4299', email: 'moldeados.cordoba@gmail.com' });

  await knex.schema.createTable('maquinas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('codigo').notNullable(); // MP-1
    t.text('nombre').notNullable(); // Papelera chica
    t.boolean('activo').notNullable().defaultTo(true);
    ts(t);
  });
  await knex.raw('create unique index maquinas_codigo_uq on maquinas (lower(codigo)) where deleted_at is null');

  await knex.schema.createTable('variantes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('codigo').notNullable(); // MGR-ROJ
    t.text('nombre').notNullable(); // Maple grande rojo
    t.text('tamano').notNullable().checkIn(['chico', 'grande'], 'variantes_tamano_check');
    t.text('color'); // null = cartón natural
    t.text('color_hex'); // con qué color se pinta el maple 3D; null = color cartón
    t.uuid('maquina_id').notNullable().references('maquinas.id').onDelete('RESTRICT');
    t.integer('maples_por_paquete').notNullable().defaultTo(60);
    t.integer('maples_por_hora').notNullable().defaultTo(0); // 0 = sin dato, no se calcula rendimiento
    t.boolean('activo').notNullable().defaultTo(true);
    ts(t);
  });
  await knex.raw('create unique index variantes_codigo_uq on variantes (lower(codigo)) where deleted_at is null');
  await knex.raw("alter table variantes add constraint variantes_color_hex_check check (color_hex ~ '^#[0-9a-f]{6}$')");
  await knex.raw('alter table variantes add constraint variantes_numeros_check check (maples_por_paquete > 0 and maples_por_hora >= 0)');

  // Receta: cuánto de cada materia prima consume la máquina por hora haciendo esta variante (en g o ml).
  await knex.schema.createTable('receta_items', (t) => {
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('CASCADE'); // la receta es parte de la variante
    t.uuid('materia_prima_id').notNullable().references('materias_primas.id').onDelete('RESTRICT');
    t.bigInteger('cantidad_por_hora').notNullable();
    t.primary(['variante_id', 'materia_prima_id']);
  });
  await knex.raw('alter table receta_items add constraint receta_cantidad_check check (cantidad_por_hora > 0)');

  // Personal de planta: no todos tienen usuario para entrar al sistema.
  await knex.schema.createTable('empleados', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.text('turno_habitual').checkIn(['manana', 'tarde'], 'empleados_turno_check');
    t.boolean('activo').notNullable().defaultTo(true);
    ts(t);
  });

  await knex.schema.createTable('partes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.date('fecha').notNullable();
    t.text('turno').notNullable().checkIn(['manana', 'tarde'], 'partes_turno_check');
    t.uuid('maquina_id').notNullable().references('maquinas.id').onDelete('RESTRICT');
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('RESTRICT');
    t.integer('minutos').notNullable();
    t.integer('pulpeadas').notNullable().defaultTo(0);
    t.integer('paquetes').notNullable();
    // Foto de la receta al momento del parte: si mañana cambian la receta, el rendimiento histórico no se mueve.
    t.integer('maples_por_paquete').notNullable();
    t.integer('maples_por_hora').notNullable();
    t.text('notas');
    anulable(t);
    t.index(['fecha', 'turno']);
    t.index(['variante_id', 'fecha']);
  });
  await knex.raw('alter table partes add constraint partes_numeros_check check (minutos > 0 and minutos <= 1440 and pulpeadas >= 0 and paquetes >= 0)');

  await knex.schema.createTable('parte_empleados', (t) => {
    t.uuid('parte_id').notNullable().references('partes.id').onDelete('RESTRICT');
    t.uuid('empleado_id').notNullable().references('empleados.id').onDelete('RESTRICT');
    t.primary(['parte_id', 'empleado_id']);
  });

  await knex.schema.createTable('parte_consumos', (t) => {
    t.uuid('parte_id').notNullable().references('partes.id').onDelete('RESTRICT');
    t.uuid('materia_prima_id').notNullable().references('materias_primas.id').onDelete('RESTRICT');
    t.bigInteger('teorico').notNullable(); // según receta × horas
    t.bigInteger('real').notNullable(); // lo que se usó (por defecto = teórico)
    t.primary(['parte_id', 'materia_prima_id']);
  });

  await knex.schema.alterTable('movimientos_stock', (t) => {
    t.uuid('parte_id').references('partes.id').onDelete('RESTRICT');
  });
  await knex.raw('alter table movimientos_stock drop constraint movimientos_motivo_check');
  await knex.raw("alter table movimientos_stock add constraint movimientos_motivo_check check (motivo in ('compra','anulacion_compra','ajuste','consumo','anulacion_consumo'))");

  await knex.schema.createTable('palets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('RESTRICT');
    t.integer('ancho').notNullable();
    t.integer('largo').notNullable();
    t.integer('alto').notNullable();
    t.integer('paquetes').notNullable(); // ancho × largo × alto
    t.text('vehiculo').checkIn(['camioneta', 'chasis', 'acoplado', 'camion_termico'], 'palets_vehiculo_check');
    t.text('destino'); // texto libre hasta que existan clientes (Corte 3)
    t.text('notas');
    anulable(t);
    t.index(['variante_id']);
  });
  await knex.raw('alter table palets add constraint palets_armado_check check (ancho > 0 and largo > 0 and alto > 0 and paquetes = ancho * largo * alto)');

  // De qué parte (lote) salió cada paquete del palet: es la trazabilidad del QR.
  await knex.schema.createTable('palet_lotes', (t) => {
    t.uuid('palet_id').notNullable().references('palets.id').onDelete('RESTRICT');
    t.uuid('parte_id').notNullable().references('partes.id').onDelete('RESTRICT');
    t.integer('paquetes').notNullable();
    t.primary(['palet_id', 'parte_id']);
  });
  await knex.raw('alter table palet_lotes add constraint palet_lotes_paquetes_check check (paquetes > 0)');
}

export async function down(knex: Knex): Promise<void> {
  for (const t of ['palet_lotes', 'palets']) await knex.schema.dropTableIfExists(t);
  await knex.raw("delete from movimientos_stock where motivo in ('consumo','anulacion_consumo')");
  await knex.schema.alterTable('movimientos_stock', (t) => t.dropColumn('parte_id'));
  await knex.raw('alter table movimientos_stock drop constraint movimientos_motivo_check');
  await knex.raw("alter table movimientos_stock add constraint movimientos_motivo_check check (motivo in ('compra','anulacion_compra','ajuste','consumo'))");
  for (const t of ['parte_consumos', 'parte_empleados', 'partes', 'empleados', 'receta_items', 'variantes', 'maquinas', 'empresa']) await knex.schema.dropTableIfExists(t);
}
