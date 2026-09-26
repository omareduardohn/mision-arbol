// scripts/check-divs.js
// Diagnóstico: reporta el depth de <div> en cada marca de sección
// (`<!-- ==== NOMBRE ==== -->`), para acotar dónde falta el </div>.

const fs = require('fs');
const path = require('path');

const archivo = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(archivo, 'utf8');

// Quitar comentarios (que podrían contener "<div" de ejemplo)
const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
const lineas = sinComentarios.split('\n');

console.log('Depth de <div> acumulado por línea.');
console.log('Mostramos solo donde el depth cambia (para no inundar).');
console.log('');

let depth = 0;
let anterior = 0;

lineas.forEach((linea, i) => {
  const a = (linea.match(/<div\b/gi) || []).length;
  const c = (linea.match(/<\/div\s*>/gi) || []).length;
  depth += a - c;

  // Mostrar solo cuando cambia el depth
  if (depth !== anterior) {
    const delta = depth - anterior;
    const marca = delta > 0 ? '+' : '';
    const txt = linea.trim().substring(0, 70);
    console.log(`L${String(i + 1).padStart(4)}  d=${String(depth).padStart(3)}  (${marca}${delta})  ${txt}`);
    anterior = depth;
  }
});

console.log('');
console.log(`Depth final: ${depth}`);