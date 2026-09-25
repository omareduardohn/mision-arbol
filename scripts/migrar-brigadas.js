#!/usr/bin/env node

/*
 * Script temporal para migrar brigadas existentes a tipo 'ecologica'.
 * No se ejecuta automáticamente en este prompt.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'brigadas-migracion.json');

function main() {
  if (!fs.existsSync(file)) {
    console.log('No hay archivo de migración. Crear data/brigadas-migracion.json con la colección exportada desde Firestore.');
    return;
  }

  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const docs = Array.isArray(json) ? json : json.documents || [];
  const pendientes = docs.filter(doc => {
    const data = doc.fields || doc.data || doc;
    const tipo = data.tipo || data.tipoBrigada || '';
    return String(tipo).toLowerCase() !== 'ecologica';
  });

  console.log(`Total documental: ${docs.length}`);
  console.log(`Pendientes por migrar: ${pendientes.length}`);

  if (pendientes.length === 0) {
    console.log('Todo está migrado.');
    return;
  }

  if (pendientes.length > 20) {
    console.warn('Hay más de 20 brigadas pendientes. Requiere revisión manual antes de aplicar cambios masivos.');
    return;
  }

  pendientes.forEach((doc, idx) => {
    const data = doc.fields || doc.data || doc;
    if (data.tipo) data.tipo = 'ecologica';
    if (data.tipoBrigada) data.tipoBrigada = 'ecologica';
    console.log(`${idx + 1}. ${doc.id || '(sin id)'} -> ecologica`);
  });

  fs.writeFileSync(file, JSON.stringify(docs, null, 2));
  console.log('Migración simulada completada. Revisar y aplicar con el comando real de Firestore cuando corresponda.');
}

main();
