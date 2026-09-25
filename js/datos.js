// js/datos.js

import {
  obtenerTerritorioCache,
  guardarTerritorioCache
} from "./territorioCache.js";

// Nombres "bonitos" para mostrar en la UI
export const ESTADOS_VENEZUELA = [
  "Amazonas","Anzoátegui","Apure","Aragua","Barinas","Bolívar","Carabobo",
  "Cojedes","Delta Amacuro","Distrito Capital","Falcón","Guárico","Lara",
  "Mérida","Miranda","Monagas","Nueva Esparta","Portuguesa","Sucre",
  "Táchira","Trujillo","La Guaira","Yaracuy","Zulia"
];

// Mapa de nombre bonito → clave del JSON (UPPERCASE sin tildes)
export const MAPA_ESTADOS_JSON = {
  "Amazonas":              "AMAZONAS",
  "Anzoátegui":            "ANZOATEGUI",
  "Apure":                 "APURE",
  "Aragua":                "ARAGUA",
  "Barinas":               "BARINAS",
  "Bolívar":               "BOLIVAR",
  "Carabobo":              "CARABOBO",
  "Cojedes":               "COJEDES",
  "Delta Amacuro":         "DELTA AMACURO",
  "Distrito Capital":      "DISTRITO CAPITAL",
  "Falcón":                "FALCON",
  "Guárico":               "GUARICO",
  "Lara":                  "LARA",
  "Mérida":                "MERIDA",
  "Miranda":               "MIRANDA",
  "Monagas":               "MONAGAS",
  "Nueva Esparta":         "NUEVA ESPARTA",
  "Portuguesa":            "PORTUGUESA",
  "Sucre":                 "SUCRE",
  "Táchira":               "TACHIRA",
  "Trujillo":              "TRUJILLO",
  "La Guaira":             "LA GUAIRA",
  "Yaracuy":               "YARACUY",
  "Zulia":                 "ZULIA"
};

export function escapeHTML(str) {
  const v = String(str ?? '');
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function claveJSON(estadoBonito) {
  return MAPA_ESTADOS_JSON[estadoBonito] || estadoBonito;
}

/* ==================== GERENCIAS ==================== */
export const GERENCIAS = [
  { id: "organizacion",  nombre: "Organización Popular y Comunas",              corto: "Organización" },
  { id: "produccion",    nombre: "Reservorio y Producción Integral de Plantas", corto: "Producción" },
  { id: "formacion",     nombre: "Formación y Educación Ambiental",              corto: "Formación" },
  { id: "plantacion",    nombre: "Reforestación y Plantación",                   corto: "Plantación" },
  { id: "politicas",     nombre: "Actividades Políticas Transversales",          corto: "Políticas" }
];

export const GERENCIAS_CORTAS = GERENCIAS.map(g => g.corto);

/* ==================== ROLES ==================== */
export const ROLES = {
  control:            "Control y Seguimiento Nacional (Admin)",
  visor_nacional:     "Visor Nacional (solo lectura)",
  reporte_nacional:   "Reporte Nacional",
  reporte_estadal:    "Reporte Estadal",
  dashboard_nacional: "Gestión Nacional",
  dashboard_estadal:  "Gestión Estadal"
};

/* ==================== CATÁLOGO DE PLANTAS (v1 — se ampliará en Fase 2B) ==================== */
export const CATALOGO_PLANTAS = {
  "Forestales": [
    "ACACIA (ACACIA DECURRENS)",
    "ACACIA ESPINOZA (ACACIA ARMATA)",
    "ACACIA FORESTAL (ACACIA MANGIUM)",
    "ACACIA SIAMEA (SENNA SIAMEA)",
    "ACEITE (COPAIFERA OFFICINALIS L)",
    "AGUANILLO (OTOBA PARVIFOLIA)",
    "ALISO (ALNUS JURULLENSIS)",
    "AMARILLON (TERMINALIA AMAZONIA)",
    "APAMATE (TABEBUIA ROSEA)",
    "ARAGUANEY (HANDROANTHUS CHRYSANTHUS)",
    "ARBOL DE CAUCHO (HEVEA BRASILIENSIS)",
    "BALSO (OCHROMA PYRAMIDALE)",
    "BARAMÁN (CATOSTEMMA COMMUNE SANDWICH)",
    "BOTOTO (COCLOSPEMUM RITIFOLIUM)",
    "BUCARE (ERYTHRINA POEPPIGIANA)",
    "BUCARE ANAUCO (ERYTHRINA FUSCA)",
    "CABIMO (COPAIFERA PANAMENSIS)",
    "CAMORUCO (STERCULIA APETALA)",
    "CAOBA (SWIETENIA MACROPHYLLA)",
    "CARAMACATE (PIRANHEA LONGEPEDUNCULATA)",
    "CAROCARO (ENTEROLOBIUM CYCLOCARPUM)",
    "CARO MONTAÑERO (PARKIA OPPOSITIFOLIA)",
    "CARTÁN (CENTROLOBIUM PARAENSE)",
    "CAUCHO HEVEA (HEVEA BENTHAMIANA)",
    "CEDRO (CEDRELA ODORATA)",
    "CEDRO DE MONTAÑA (CEDRELA MONTANA)",
    "CEIBA (CEIBA PENTANDRA)",
    "CHAPARRO LLANERO (URATELLA AMERICANA L)",
    "CINARO (PSIDIUM CAUDATUM)",
    "CLEMÓN (THESPESIA POPULNEA)",
    "COCO DE MONO (LECYTHIS OLLARIA)",
    "COCOTERO (COCOSNUCIFERA)",
    "COJÓN O COJÓN DE BERRACO (TABERNAEMONTANA DONNELL-SMITHII)",
    "COPAIBA (COPAIFERA OFFICINALIS)",
    "CUJÍ Ó CUJÍYAQUE (PROSOPIS JULIFLORA)",
    "CURARÍ O TAHUARÍ (TABEBUIA SERRATIFOLIA)",
    "DRAGO (DRACAENA DRACO)",
    "ÉBANO (EBENOPSIS EBANO)",
    "EL LLORO SANGRE (CROTON DRACO)",
    "EL NIÑO O CUCHARO (GYRANTHERA CARIBENSIS)",
    "FRAMBOYÁN (DELONIX REGIA)",
    "FRESNO (FRAXINUS)",
    "FRUTO DE BURRO (XYLOPIA AROMATICA)",
    "GRANADILLO (LIBIDIBIA CAESALPINIA PUNCTATA)",
    "GUÁCIMO (GUAZUMA ULMIFOLIA)",
    "GUATAMARE O GUATAMARE (MYROSPERMUM FRUTESCENS)",
    "GUATAPANARE O DIVI-DIVI (CAESALPINIA CORIARIA)",
    "JABILLO (HURA CREPITANS)",
    "JACARANDA (JACARANDA MIMOSIFOLIA)",
    "JOBO (SPONDIAS MOMBIN)",
    "LACRE (VISMIA BACCÍFERA)",
    "LEUCAENA O GUAJE (LEUCAENA LEUCOCEPHALA)",
    "MANGLE ROJO (RHIZOPHORA MANGLE)",
    "MASAGUARO (PITHECELLOBIUM GUACHAPELE)",
    "MIJAO (ANACARDIUM EXCELSUM)",
    "MUREILLO (ERISMA UNCINATUM)",
    "NEEM, MARGOSA O LILA INDIA (AZADIRACHTA INDICA)",
    "NOGAL (JUGLANS REGIA)",
    "NOGAL ANDINO (JUGLANS NEOTROPICA)",
    "NOGAL DE CARACAS (JUGLANS VENEZUELENSIS)",
    "PALMA LLANERA (COPERNICIA TECTORUM)",
    "PALMA MORICHE (MAURITIA FLEXUOSA)",
    "PALMA REAL (ROYSTONEA REGIA)",
    "PALO BRASIL O PERNAMBUCO (PAUBRASILIA ECHINATA)",
    "PALO SANO (VERA) (BULNESIA ARBOREA)",
    "PARA PARA O JABONCILLO (SAPINDUS SAPONARIA)",
    "PARDILLO (CORDIA ALLIODORA)",
    "PEONIO (ORMOSIA PARAENSIS)",
    "PILÓN (HIERONYMA ALCHORNEOIDES L)",
    "PINO (PINUS)",
    "PINO CRIOLLO (PRUMNOPITYS MONTANA)",
    "PINO LASO (DECUSSOCARPUS ROSPIGLIOSII)",
    "PIONIA (ORMOSIA COCCINEA)",
    "ROBLE (PLATYMISCIUM DIADELPHUM)",
    "ROBLE EUROPEO (QUERCUS ROBUR)",
    "ROSO BLANCO (BROWNEA LEUCANTHA)",
    "SAMÁN (SAMANEA SAMAN)",
    "SAMÁN MARGARITEÑO (ALBIZIA LEBBECK)",
    "SAQUI SAQUI O CEIBA ROJA (BOMBACOPSIS QUINATUM)",
    "SIMARUBA (SIMAROUBA AMARA)",
    "TAMARINDO (TAMARINDUS INDICA)",
    "TECA (TECTONA GRANDIS)",
    "TIAMO (ACACIA GLOMEROSA)",
    "TINAJITO (ALEXA CANARACUNENSI)",
    "VERA (PLECTROCARPA ARBOREA)",
    "VERA O PALO SANO (BULNESIA ARBÓREA)",
    "YACURE (PITHECELLOBIUM DULCE)",
    "YAGRUMO (CECROPIA PELTATA)",
    "YAGÜE (CAPPARIS LINEARIS)",
    "ZAPATERO (MONTEVERDIA PITTIERIANA)"
  ],
  "Frutales": [
    "ACHIOTE U ONOTO (BIXA ORELLANA)",
    "AGUACATE (PERSEA AMERICANA)",
    "ALGARROBO EUROPEO (CERATONIA SILIQUA L)",
    "ALMENDRON (TERMINALIA CATAPPA)",
    "ANON O RIÑON (ANNONA SQUAMOSA)",
    "ÁRBOL DEL PAN O FRUTIPÁN (ARTOCARPUS ALTILIS)",
    "CACAO (THEOBROMA CACAO)",
    "CAFÉ (COFFEA ARÁBICA)",
    "CAIMITO (CHRYSOPHYLLUM CAINITO)",
    "CASTAÑO (CASTANEA SATIVA)",
    "CEREZO SILVESTRE (PRUNUS AVIUM)",
    "CHACHA FRUTO (ERYTHRINA EDURIS)",
    "CHIRIMOYA (ANNONA CHERIMOLA)",
    "CIRUELA HUESITO (SPONDIAS PURPUREA)",
    "COCO (COCOS NUCIFERA)",
    "COPOAZÚ (THEOBROMA GRANDIFLORUAM)",
    "COROZO (BACTRIS GUINEENSIS)",
    "FRESA O FRUTILLA (FRAGARIA)",
    "FRESA SILVESTRE O FRESILLA (FREGARIA VESCA)",
    "GRANADA (PUNICA GRANATUM)",
    "GUAMA DE MONTAÑA (INGA EDULIS)",
    "GUAMACHE (PERESKIA GUAMACHO)",
    "GUAMO (INGA SPURIA)",
    "GUANÁBANA (ANNONA MURICATA)",
    "GUAYABA (PSIDIUM GUAJAVA)",
    "HIGO (FICUS CARICA)",
    "ICACO (CHRYSOBALANUS ICACO)",
    "LECHOSA (CARICA PAPAYA)",
    "LIMA PERSA (CITRUS X LATIFOLIA)",
    "LIMÓN (CITRUS LIMON)",
    "LIMONCILLO (SWINGLEA GLUTINOSA)",
    "LULO O UVA DE MONTE (SOLANUM QUITOENSE)",
    "MAMÓN (MELICOCCUS BIJUGATUS)",
    "MANACA (EUTERPE OLERACEA)",
    "MANDARINA (CITRUS RETICULATA)",
    "MANGO (MANGIFERA INDICA)",
    "MARACUYA O PARCHITA (PASSIFLORA EDULIS SIMS)",
    "MERECURE O MASAGUARO (LICANIA PYRIFOLIA)",
    "MEREY O PAJUI (ANACARDIUM OCCIDENTALE)",
    "MORA, ZARZAMORA ANDINA O MORA DE CASTILLA (RUBUS GLAUCUS)",
    "NARANJA (CITRUS X SINENSIS)",
    "NÍSPERO (MANILKARA ZAPOTA)",
    "NÍSPERO JAPONÉS (ERIBOTRYA JAPÓNICA)",
    "NUEZ DE BRAZIL (BERTHOLLETIA EXCELSA)",
    "PALMA DATILERA (PHOENIX DACTYLIFERA)",
    "POMALACA (SYZYGIUM MALACCENSE)",
    "PONSIGUÉ (ZIZYPHUS MAURITIANA)",
    "PUMARROSA O PUMA GAS (SYZYGIUM JAMBOS)",
    "QUIMBOMBÓ O OKRA (ABELMOSCHUS ESCULENTUS)",
    "SARRAPIA O CUMARÚ (DIPTERYX PUNCTATA)",
    "SEMERUCO O CERECITA (MALPIGHIA EMARGINATA)",
    "TOMATE DE ÁRBOL (SOLANUM BETACEAUM)",
    "TORONJO O CIDRO (CITRUS PARADISI)",
    "UVA DE PLAYA (COCCOLOBA UVIFERA)",
    "ZAPOTE ANDINO (POUTERIA SAPOTA)"
  ],
  "Ornamentales": [
    "ACHIRA, CAPACHO O MARACA (CANNA INDICA)",
    "AGAVE AMERICANA (AGAVE SALMIANA)",
    "AGAVE COCUY (AGAVE COCUI TREL)",
    "AGAVE DESMETTIANA O AGAVE DE JADE (AGAVE DESMETTIANA)",
    "AGAVE O MAGUEY (AGAVE)",
    "ALGARROBO (HYMENAEA COURBARIL)",
    "ALGODONCILLO (ASCLEPIAS)",
    "AMARGOSO O GATEADO (ASTRONIUM GRAVEOLENS)",
    "AVE DEL PARAÍSO (STRELITZIA REGINAE)",
    "BAMBÚ AMARILLO (PHYLLOSTACHYS AUREA)",
    "BARBERIS (BERBERIS VULGARIS)",
    "BELLAS A LAS ONCE O VERDOLAGA DE FLOR (PORTULACA GRANDIFLORA)",
    "BLEDO O SABIA (AMARANTHUS RETROFLEXUS)",
    "BOTÓN DE ORO O FALSO GIRASOL (TITHONIA DIVERSIFOLIA)",
    "CACHO DE VENADO (PLATYCERIUM BIFURCATUM)",
    "CALA (ZANTEDESCHIA AETHIOPICA)",
    "CAÑA FISTULA (CASSIA FISTULA)",
    "CAPA ROJA O ACALIFA (ACALYPHA WILKESIANA)",
    "CARACUEY (BROMELIA HUMILIS)",
    "CARAPA (CARAPA GUIANENSIS)",
    "CARBONERO ROJO (CALLIANDRA TRINERVIA)",
    "CAYENA (HIBISCUS SPP.)",
    "CAYENA O AMAPOLA (HIBISCUS ROSA-SINENSIS)",
    "CHAGUARAMO (ROYSTONEA OLERACEA)",
    "CHAGUARAMO ENANO (VEITCHIA MERRILLI)",
    "CINTA (CHOROPHYTUM COMOSUM)",
    "CLAVELLINAS (DIANTHUS CHINENSIS)",
    "COLA DE GALLO (APHELANDRA SCABRA)",
    "CÓLEO O ALFOMBRA (SOLENOSTEMON BLUMEI)",
    "COQUETA, TERESITA O VINCA ROSEA (CATHARANTHUS ROSEUS)",
    "CORAZON DE HOMBRE (PEPEROMIA PELLUCIDA)",
    "CORAZÓN DE JESÚS (CALADIUM BICOLOR)",
    "CORONA DE CRISTO (EUPHORBIAMILII)",
    "CROTOS (CODIAEUM SPP.)",
    "CUCARACHA (TRADESCANTIA ZEBRINA)",
    "DAMA DE NOCHE (EPIPHYLLUM OXYPETALUM)",
    "DRACO (DRACAENA DRACO SUBSP)",
    "ESPADA DE BOLÍVAR O LENGUA DE SUEGRA (SANSEVIERIA TRIFASCIAT)",
    "FLOR AMARILLA O CURARÍ (HANDROANTHUS SERRATIFOLIA)",
    "FLOR DE PAVO REAL (CAESALPINA PULCHERRIMA)",
    "FRAILEJÓN (ESPELETIA SCHULTZII)",
    "FRAILEJÓN ARBORESCENTE (ESPELETIA NERIIFOLIA)",
    "FRANGIPANI (PLÚMERIA)",
    "FRESNILLO (DICTAMUS ALBUS)",
    "GARBANCILLO (ASTRAGALUS NITIDIFLORUS)",
    "GERANIO COMÚN (PELARGONIUM ZONALE)",
    "GIRASOL (HELIANTHUS ANNUUS)",
    "GUAYACÁN (TABEBUIA GUAYACAN)",
    "GUAYACÁN O CURARÍ (GUAIACUM OFFICINALE)",
    "HELECHO (PTERIDIUM AQUILINUM)",
    "HELICONIA ARCO IRIS (PLÚMERIA WAGNERIANA)",
    "HOJA DE HIGADO O BARQUITO (TRADESCANTIA SPATHACEA)",
    "HOJA DE SANGRE (HYPOESTES PHYLLOSTACHYA)",
    "IXORA O GERANIO (IXORA COCCINEA)",
    "KALANCHOE (KALANCHOE PINNATA)",
    "LIRIO O AZUCENA (LILIUM)",
    "LLUVIA DE ORO (LABURNUM ANAGYROIDES)",
    "MADRE PERLA (GRAPTOPETALUM PARAGUAYENSE)",
    "MALANGA (COLOCASIA ESCULENTA)",
    "MANI FORRAJERO (ARACHIS PINTOI)",
    "MANITO DE DIOS (XIPHIDEUM CAERULEUM)",
    "MANTO ROJO (MEGASKEPASMA ERYTHROCHLAMYS)",
    "MARGARINA (BELLIS PERENNIS)",
    "MELINA (GMELINA ARBOREA)",
    "MILLONARIA (PLECTRANTHUS VERTICILLATUS)",
    "NARANJILLO (CITRONELLA MUCRONATA)",
    "NEVADO EN PARÍS (BREYNIA DISTICHA)",
    "OREJA DE MONO O TIMBÓ COLORADO (ENTEROLOBIUM CONTORTISILIQUUM)",
    "ORQUÍDEA (ORCHIDACEAE)",
    "PALMA ACEITERA (ELAEIS GUINEENSIS)",
    "PALMA ARECA (DYPSIS LUTESCENS)",
    "PALMA BLANCA (WASHINGTONIA ROBUSTA)",
    "PALMA COLA PESCAO (CARYOTA URENS)",
    "PALMA DE CACHO (AIPHANES LINDENIANA)",
    "PALMA DE CEILÁN (CORYPHA UMBRACULIFERA)",
    "PALMA DE CERA (CEROXYLON QUINDIUENSE)",
    "PALMA DE TI (CORDYLINE FRUTICOSA)",
    "PALMERAS O PALMAS (ARECACEAE)",
    "PALO DE MARIA (CALOPHYLLUM BRASILIENSE)",
    "PALO MULATO O INDIO DESNUDO (BURSERA SIMARUBA)",
    "PEDILANTO O PEDILANTHUS (EUPHORBIA)",
    "PESGUA O JAMBOLÁN (SYZYGIUM CUMINI)",
    "PLATANILLOS (HELICONIA MARIAE HOOK. F.)",
    "RABO DE RATÓN (PEPEROMIA CAPERATA)",
    "REINA DE LA NOCHE (SELENICEREUS GRANDIFLORUS)",
    "ROSA (GLANDINFLORA)",
    "SAN RAFAEL (SENECIO CHENOPODIOIDES)",
    "SANGRE DE DRAGO (PTEROCARPUS ACAPULCENSIS)",
    "SANGUINARIA (SANGUINARIA CANADENSIS)",
    "SOMBREIRO (CLITORIA FAIRCHILDIANA)",
    "TAPARO, TOTUMO O JÍCARO (CRESCENTIA CUJETE)",
    "TÁRTAGO (EUPHORBIA LATHYRIS)",
    "TRINITARIA (BOUGAINVILLEA)",
    "TULIPAN AFRICANO (SPATHODEA CAMPANULATA)",
    "UNIÓN DE LOS CASADOS (GRAPTOPHYLLUM PICTUM)",
    "URAPÁN (FRAXINUS UHDEI)",
    "URUPAGUA (METTENIUSA NUCIFERA)",
    "VETIVER (CHRYSOPOGON ZIZANIOIDES)",
    "ZAPATILLA DE DAMA O ZUECO (CYPRIPEDIUM CALCEOLUS)"
  ],
  "Medicinales": [
    "ACETAMINOFÉN (PLECTRANTHUS ORNATUS CODD)",
    "ALBAHACA (OCIMUM BASILICUM)",
    "ALHELÍ AMARILLO (ERYSIMUM CHEIRI)",
    "ALOE VERA O SÁBILA (ALOE BARBADENSIS MILLER)",
    "ANÍS (PIMPINELLA ANISUM)",
    "APNEA ÁRBOL DE LA CRUZ (BROWNEA ARIZA)",
    "ÁRNICA (ARNICA SPP.)",
    "CAÑA AGRIA (COSTUS SOPECIOSUS)",
    "COLA DE CABALLO (EQUISETUM ARVENSE)",
    "CÚRCUMA (AZAFRÁN DEL POBRE O PALILLO)",
    "DIENTE DE LEÓN (TARAXACUM OFFICINALE)",
    "ESCOBA AMARGA (PARTHENIUM HYSTEROPHORUS)",
    "EUCALIPTO (EUCALYPTUS)",
    "FLOR DE JAMAICA (HIBISCUS SABDARIFFA)",
    "GOLONDRINA O LECHERITA (EUPHORBIA HETEROPHYLLA)",
    "HIERBA DE SAN JUAN (HYPERICUM PERFORATUM)",
    "HIERBABUENA (MENTHA SPICATA)",
    "INCIENSO (BOSWELLIA SACRA)",
    "JENJIBRE O KION (ZINGIBER OFFICINALE)",
    "LAVANDA (LAVANDULA ANGUSTIFOLIA)",
    "MALOJILLO (CYMBOPOGON CITRATUS)",
    "MANZANILLA (CAMOMILA)",
    "MORINGA (MORINGA OLEIFERA)",
    "ORTIGA VERDE (URTICA DIOCA)",
    "PALO SANTO (BURSERA GRAVEOLENS)",
    "PATA DE VACA O PEZUÑA DE BUEY (BAUHINIA FORFICATA)",
    "PAYA RATÓN O MATARRATÓN (GLIRICIDIA SEPIUM)",
    "RETAMA AMARILLA (RETAMA SPHAEROCARPA)",
    "ROMERO (ROSMARINUS OFFICINALIS L)",
    "SANGRE DE TORO (RICHARDIA SCABRA)",
    "SAUCO (SAMBUCUS)",
    "TÉ AMARILLO O PLANTA DE TÉ (CAMELIA SINENSIS)",
    "TOMILLO (THYMUS VULGARIS)",
    "TORONJIL (MELISSA OFFICINALIS)",
    "VALERIANA (VALERIANA OFFICINALIS)",
    "YATAGO (TRICHANTHERA GIGANTEA)"
  ]
};

/* ==================== TIPOS DE ACTIVIDAD POR GERENCIA (nuevo — Fase 2A) ==================== */
export const TIPOS_ACTIVIDAD_POR_GERENCIA = {
  organizacion: [
    'Conformación de Brigada Ecológica',
    'Juramentación de Brigada',
    'Conformación de Comité Ecosocialista',
    'Asamblea Comunitaria',
    'Reunión con Consejo Comunal',
    'Reunión con Comuna / Circuito Comunal',
    'Mesa de Gestión Forestal',
    'Articulación Interinstitucional',
    'Directorio / Reunión de Planificación',
    'Acompañamiento a Movimientos Sociales',
    'Censo / Mapeo de Voluntariado',
    'Inspección al Territorio',
    'Otro (especificar)'
  ],
  produccion: [
    'Recolección de Semillas',
    'Recolección de Brinzales',
    'Llenado de Bolsas',
    'Germinación de Semillas',
    'Producción de Sustrato / Abono / Biofertilizante',
    'Corte de Esquejes',
    'Mantenimiento de Vivero',
    'Creación y/o Monitoreo de Espacios Productivos',
    'Identificación de Espacios de Banco de Germoplasma',
    'Entrega de Semillas a Instituciones / Comunidades',
    'Hagamos del Plástico un Árbol',
    'Preparación de Canteros',
    'Otro (especificar)'
  ],
  formacion: [
    'Taller Formativo',
    'Conversatorio',
    'Cineforo Ambiental',
    'Charla Educativa',
    'Seminario',
    'Foro Nacional',
    'Aulas Verdes para la Práctica Ecosocialista',
    'Aulas Abiertas Vivero Misión Árbol',
    'Rutas Pedagógicas "Árboles de mi Comunidad"',
    'Diplomado',
    'Eco-sendero',
    'Expedición Pedagógica',
    'Jueves Eco Productivos para la Propagación Vegetal',
    'Gran Jornada de Recolección de Semillas',
    'Gran Jornada de Elaboración de Sustrato',
    'Despliegue Nacional 1E1A (Un Estudiante, Un Árbol)',
    'Conversatorio Programa 1E1A',
    'Actividad Recreativa Ecológica',
    'Visita Técnica',
    'Otro (especificar)'
  ],
  plantacion: [
    'Jornada de Reforestación (Forestales)',
    'Jornada de Reforestación (Frutales)',
    'Jornada de Reforestación (Mixta)',
    'Plantación Ornamental / Paisajismo',
    'Identificación de Árboles Semilleros',
    'Conservación de Especies Establecidas',
    'Atención a Árboles (Mantenimiento Fitosanitario)',
    'Realización de Hoyaduras',
    'Lanzamiento de Avíos',
    'Aplicación de Instrumento para Bancos de Tierra',
    'Eco-senderismo / Expedición Pedagógica',
    'Ruta Pedagógica "Árboles de mi Comunidad"',
    'Jornada de Reforestación Preventiva (Ríos / Quebradas)',
    'Jornada de Conservación de Manglar',
    'Reforestación Conmemorativa',
    'Otro (especificar)'
  ],
  politicas: [
    // Escritura abierta — la lista queda con una sola opción libre
    'Otro (especificar)'
  ]
};

/* ==================== ENTES ADSCRITOS / UTEC ==================== */
export const ENTES_ADSCRITOS = [
  'Minec',
  'Inparques',
  'Conare',
  'Bomberos Forestales',
  'Guardería Ambiental',
  'Guardia del Pueblo',
  'GNB',
  'PNB',
  'Policía Estadal',
  'Milicia Bolivariana',
  'Hidroven',
  'Corpoelec',
  'Inatur',
  'Seniat',
  'Alcaldía',
  'Gobernación',
  'UBV',
  'UNES',
  'UTEC',
  'Iclam',
  'Fundayacucho',
  'Misión Venezuela Joven',
  'Movimiento por la Paz y la Vida',
  'Robert Serra',
  'JPSUV',
  'Minmujer',
  'Fundaproal',
  'RIE',
  'Instituto de Jóvenes',
  'CMDNNA',
  'Partido Verde',
  'BERSOC',
  'Protección Civil',
  'INDER',
  'CDCEM',
  'IMEC',
  'SIVA',
  'Ninguno',
  'Otro'
];

/* ==================== MINISTERIOS / SISTEMA DE MISIONES ==================== */
export const MINISTERIOS = [
  'Ninguno',
  'Ministerio del Poder Popular para la Salud',
  'Ministerio del Poder Popular para la Juventud',
  'Ministerio del Poder Popular para la Defensa',
  'Ministerio del Poder Popular para la Cultura',
  'Ministerio del Poder Popular para la Educación',
  'Ministerio del Poder Popular para la Educación Universitaria',
  'Ministerio del Poder Popular para Ciencia y Tecnología',
  'Ministerio del Poder Popular para la Agricultura Productiva y Tierras',
  'Ministerio del Poder Popular para la Atención de las Aguas',
  'Ministerio del Poder Popular para la Energía Eléctrica',
  'Ministerio del Poder Popular para la Mujer y la Igualdad de Género',
  'Ministerio del Poder Popular para las Comunas y los Movimientos Sociales',
  'Ministerio del Poder Popular para Relaciones Interiores, Justicia y Paz',
  'Ministerio del Poder Popular para el Turismo',
  'Ministerio del Poder Popular para el Deporte',
  'Sistema Nacional de Misiones, Grandes Misiones y Micro-Misiones',
  'Misión Árbol',
  'Otro'
];

/* ==================== PROGRAMAS ==================== */
export const PROGRAMAS = [
  'Programa Nacional de Reforestación',
  'Gran Misión Árbol',
  'Plan Ecosocialista',
  'Programa de Formación Ambiental',
  'Plan de Manejo de Residuos',
  'Programa de Agricultura Urbana',
  'Plan de Recuperación de Cuencas'
];

/* ==================== CATEGORÍAS DE PARTICIPANTES ==================== */

/**
 * Categorías de participantes agrupadas por rango etario y género.
 * Cada categoría se registra como un campo numérico en el formulario.
 */
export const CATEGORIAS_PARTICIPANTES = [
  { id: 'ninos',           label: 'Niños',           grupo: 'Niñez',          genero: 'M' },
  { id: 'ninas',           label: 'Niñas',           grupo: 'Niñez',          genero: 'F' },
  { id: 'adolescentes',    label: 'Adolescentes',    grupo: 'Adolescencia',   genero: 'M' },
  { id: 'adolescentas',    label: 'Adolescentas',    grupo: 'Adolescencia',   genero: 'F' },
  { id: 'adultos',         label: 'Adultos',         grupo: 'Adultez',        genero: 'M' },
  { id: 'adultas',         label: 'Adultas',         grupo: 'Adultez',        genero: 'F' },
  { id: 'adultos_mayores', label: 'Adultos mayores', grupo: 'Adultez mayor',  genero: 'M' },
  { id: 'adultas_mayores', label: 'Adultas mayores', grupo: 'Adultez mayor',  genero: 'F' }
];

/**
 * Calcula los totales de participantes a partir de un objeto plano
 * con las claves de CATEGORIAS_PARTICIPANTES.
 *
 * Entrada: { ninos: 3, ninas: 2, adultos: 10, adultas: 8, ... }
 * Salida:  { totalM: 13, totalF: 10, totalGeneral: 23 }
 *
 * @param {Object} participantes
 * @returns {{ totalM: number, totalF: number, totalGeneral: number }}
 */
export function calcularTotalParticipantes(participantes = {}) {
  let totalM = 0;
  let totalF = 0;

  CATEGORIAS_PARTICIPANTES.forEach((cat) => {
    const valor = parseInt(participantes[cat.id], 10) || 0;
    if (cat.genero === 'M') totalM += valor;
    else if (cat.genero === 'F') totalF += valor;
  });

  return {
    totalM,
    totalF,
    totalGeneral: totalM + totalF
  };
}

/* ==================== CACHE TERRITORIAL ==================== */
let _territorio = null;

export async function cargarTerritorio() {
  if (_territorio) return _territorio;

  // 🔧 FIX: renombrado de 'loader' → 'loaderEl' para evitar shadow de la
  // función loader() exportada por auth.js. Previene conflictos de scope
  // si en el futuro este módulo importa loader de auth.js.
  const loaderEl = document.getElementById('loader');
  if (loaderEl) {
    loaderEl.textContent = 'Cargando datos territoriales...';
    loaderEl.classList.remove('oculto');
  }

  try {
    // 1. Intentar leer del caché IndexedDB (rápido)
    const cached = await obtenerTerritorioCache();
    if (cached) {
      _territorio = cached;
      return _territorio;
    }

    // 2. Si no hay caché, descargar de la red
    if (loaderEl) loaderEl.textContent = 'Descargando datos territoriales (7 MB)...';
    const res = await fetch('/data/comunas_y_consejos.json');
    _territorio = await res.json();

    // 3. Guardar en IndexedDB para la próxima
    guardarTerritorioCache(_territorio).catch(() => {});

    return _territorio;

  } catch (e) {
    console.warn('No se pudo cargar comunas_y_consejos.json', e);
    _territorio = {};
    return _territorio;
  } finally {
    if (loaderEl) loaderEl.classList.add('oculto');
  }
}

export function getTerritorio() { return _territorio || {}; }

/**
 * Resetea un <select> a su estado vacío por defecto.
 * @param {HTMLSelectElement} sel
 * @param {string} [placeholder='Seleccione...']
 */
export function resetSelect(sel, placeholder = 'Seleccione...') {
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  sel.disabled = true;
}

/**
 * Convierte cualquier valor (Timestamp de Firestore, string ISO,
 * Date) en un objeto Date, o null si no es válido.
 * @param {*} value
 * @returns {Date|null}
 */
export function toDateValue(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/* ===== Funciones de navegación territorial (con normalización) ===== */

export function municipiosDe(estadoBonito) {
  const t = getTerritorio();
  const key = claveJSON(estadoBonito);
  const estado = t[key];
  if (!estado || typeof estado !== 'object') return [];
  return Object.keys(estado).sort();
}

export function parroquiasDe(estadoBonito, municipio) {
  const t = getTerritorio();
  const key = claveJSON(estadoBonito);
  const mun = t[key]?.[municipio];
  if (!mun || typeof mun !== 'object') return [];
  return Object.keys(mun).sort();
}

export function comunasDe(estadoBonito, municipio, parroquia) {
  const t = getTerritorio();
  const key = claveJSON(estadoBonito);
  const dato = t[key]?.[municipio]?.[parroquia];
  if (!dato) return [];

  if (Array.isArray(dato)) {
    return dato
      .map(item => typeof item === 'string' ? item : (item?.nombre || item?.codigo || ''))
      .filter(Boolean);
  }

  if (typeof dato === 'object') {
    const direct = Object.keys(dato).filter(k => k && !['codigo', 'nombre', 'tipo', 'consejos_comunales'].includes(k)).sort();
    if (direct.length) return direct;
    const fromArray = Object.values(dato).flatMap((value) => {
      if (!Array.isArray(value)) return [];
      return value.map(item => typeof item === 'string' ? item : (item?.nombre || item?.codigo || ''));
    });
    return fromArray.filter(Boolean);
  }

  return [];
}

export function consejosComunalesDe(estadoBonito, municipio, parroquia, comuna) {
  const t = getTerritorio();
  const key = claveJSON(estadoBonito);
  const objetoParroquia = t[key]?.[municipio]?.[parroquia];
  if (!objetoParroquia) return [];

  const arrComunas = Array.isArray(objetoParroquia)
    ? objetoParroquia
    : Object.values(objetoParroquia).flatMap(v => Array.isArray(v) ? v : []);

  const comunaMatch = arrComunas.find((item) => {
    if (typeof item === 'string') return item === comuna;
    return (item?.nombre || '') === comuna || (item?.codigo || '') === comuna;
  });

  if (comunaMatch) {
    const consejoList = Array.isArray(comunaMatch.consejos_comunales)
      ? comunaMatch.consejos_comunales
      : Array.isArray(comunaMatch) ? comunaMatch : [];
    return consejoList
      .map(item => typeof item === 'string' ? item : (item?.nombre || item?.codigo || ''))
      .filter(Boolean);
  }

  const dato = t[key]?.[municipio]?.[parroquia]?.[comuna];
  if (dato) {
    if (Array.isArray(dato)) {
      return dato
        .map(item => typeof item === 'string' ? item : (item?.nombre || item?.codigo || ''))
        .filter(Boolean);
    }
    if (typeof dato === 'object') {
      const likelyList = dato.consejos_comunales || Object.values(dato).flatMap(v => Array.isArray(v) ? v : []);
      return likelyList
        .map(item => typeof item === 'string' ? item : (item?.nombre || item?.codigo || ''))
        .filter(Boolean);
    }
  }

  return [];
}