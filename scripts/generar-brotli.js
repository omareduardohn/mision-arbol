// scripts/generar-brotli.js
//
// Genera una versión comprimida con Brotli del JSON territorial.
// Uso:
//   node scripts/generar-brotli.js
//
// Resultado:
//   data/comunas_y_consejos.json.br
//
// Por qué: el JSON pesa ~7 MB. Con Brotli baja a ~1.5 MB, lo cual acelera
// muchísimo la primera carga en móviles. Firebase Hosting sirve el .br
// automáticamente si el navegador lo pide (Accept-Encoding: br).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ORIGEN = path.join(__dirname, '..', 'data', 'comunas_y_consejos.json');
const DESTINO = ORIGEN + '.br';

function main() {
  if (!fs.existsSync(ORIGEN)) {
    console.error('✗ No existe:', ORIGEN);
    process.exit(1);
  }

  const statOriginal = fs.statSync(ORIGEN);
  console.log(`Origen:  ${ORIGEN}`);
  console.log(`Tamaño:  ${(statOriginal.size / 1024 / 1024).toFixed(2)} MB`);
  console.log('Comprimiendo con Brotli quality=11 (puede tardar 30-60 segundos)...');

  const inicio = Date.now();
  const buffer = fs.readFileSync(ORIGEN);

  // quality: 11 es el máximo (mejor compresión, más lento)
  // Una sola pasada es suficiente para JSON
  const comprimido = zlib.brotliCompressSync(buffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
    }
  });

  fs.writeFileSync(DESTINO, comprimido);

  const ms = Date.now() - inicio;
  const ratio = (1 - comprimido.length / buffer.length) * 100;

  console.log('');
  console.log(`✓ Listo en ${(ms / 1000).toFixed(1)}s`);
  console.log(`Destino: ${DESTINO}`);
  console.log(`Tamaño:  ${(comprimido.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Ahorro:  ${ratio.toFixed(1)}%`);
}

main();