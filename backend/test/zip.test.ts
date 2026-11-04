import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zip } from '../src/lib/zip.js';

describe('zip de exportación', () => {
  it('lo abre unzip con el contenido intacto (acentos incluidos)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'moldeados-zip-'));
    const archivo = join(dir, 'x.zip');
    const texto = '﻿Fecha;Cliente\r\n03/11/2026;Granja Los Álamos\r\n'.repeat(200);
    writeFileSync(archivo, zip([{ nombre: 'ventas.csv', datos: Buffer.from(texto) }, { nombre: 'vacío.csv', datos: Buffer.alloc(0) }]));
    expect(execFileSync('unzip', ['-t', archivo]).toString()).toContain('No errors');
    expect(execFileSync('unzip', ['-p', archivo, 'ventas.csv']).toString()).toBe(texto);
  });
});
