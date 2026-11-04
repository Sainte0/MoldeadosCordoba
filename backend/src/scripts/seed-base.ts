import { db } from '../db.js';

// Materias primas de arranque, solo si la tabla está vacía (no pisa nada). El resto se carga desde la app.
async function main(): Promise<void> {
  await semillaMaquinas();
  if (await db('materias_primas').first('id')) return console.log('Materias primas ya cargadas, no toco nada.');
  await db('materias_primas').insert([
    { nombre: 'Cartón', tipo: 'carton', unidad: 'kg' },
    { nombre: 'Aglutinante', tipo: 'aglutinante', unidad: 'l' },
    { nombre: 'Tinta roja', tipo: 'tinta', unidad: 'l', color: 'Rojo' },
  ]);
  console.log('Materias primas base cargadas.');
}

// Las dos papeleras de la planta y los cuatro códigos básicos, sin receta (la cargan ellos).
async function semillaMaquinas(): Promise<void> {
  if (await db('maquinas').first('id')) return console.log('Máquinas ya cargadas, no toco nada.');
  const [mp1] = await db('maquinas').insert({ codigo: 'MP-1', nombre: 'Papelera chica' }).returning('id');
  const [mp2] = await db('maquinas').insert({ codigo: 'MP-2', nombre: 'Papelera grande' }).returning('id');
  await db('variantes').insert([
    { codigo: 'MCH-NAT', nombre: 'Maple chico natural', tamano: 'chico', maquina_id: mp1.id },
    { codigo: 'MCH-ROJ', nombre: 'Maple chico rojo', tamano: 'chico', color: 'Rojo', color_hex: '#b3262a', maquina_id: mp1.id },
    { codigo: 'MGR-NAT', nombre: 'Maple grande natural', tamano: 'grande', maquina_id: mp2.id },
    { codigo: 'MGR-ROJ', nombre: 'Maple grande rojo', tamano: 'grande', color: 'Rojo', color_hex: '#b3262a', maquina_id: mp2.id },
  ]);
  console.log('Máquinas MP-1/MP-2 y códigos de maple base cargados.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
