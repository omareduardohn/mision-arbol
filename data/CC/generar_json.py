# -*- coding: utf-8 -*-
"""
Genera un JSON jerárquico a partir del Excel de Comunas y Circuitos.
Estructura: ESTADO -> MUNICIPIO -> PARROQUIA -> [Comunas/Circuitos con sus Consejos Comunales]
"""

import os
import json
import glob
from collections import OrderedDict

import pandas as pd

# ------------------------------------------------------------
# 1. Buscar automáticamente el archivo Excel en la carpeta
# ------------------------------------------------------------
carpeta = os.path.dirname(os.path.abspath(__file__))
archivos_xlsx = glob.glob(os.path.join(carpeta, "*.xlsx"))

if not archivos_xlsx:
    raise FileNotFoundError(
        f"❌ No se encontró ningún archivo .xlsx en: {carpeta}\n"
        "   Coloca el Excel en la misma carpeta que este script."
    )

# Si hay varios, toma el primero
archivo_excel = archivos_xlsx[0]
print(f"📂 Leyendo: {os.path.basename(archivo_excel)}")

# ------------------------------------------------------------
# 2. Leer el Excel
# ------------------------------------------------------------
df = pd.read_excel(archivo_excel, engine="openpyxl", dtype=str)

# Limpiar nombres de columnas
df.columns = df.columns.astype(str).str.strip()

# Normalizar: NaN -> "", quitar espacios sobrantes
df = df.fillna("")
for col in df.columns:
    df[col] = df[col].astype(str).str.strip()

# ------------------------------------------------------------
# 3. Nombres exactos de las columnas
# ------------------------------------------------------------
C_ESTADO      = "ESTADO"
C_MUNICIPIO   = "MUNICIPIO"
C_PARROQUIA   = "PARROQUIA"
C_COD_COMUNA  = "CÓDIGO SITUR DE COMUNA O CIRCUITO ELECTORAL"
C_NOM_COMUNA  = "NOMBRE DE LA COMUNA O CIRCUITO ELECTORAL"
C_COD_CONSEJO = "CÓDIGO SITUR NUEVO DEL CONSEJO COMUNAL"
C_NOM_CONSEJO = "NOMBRE DEL CONSEJO COMUNAL"
C_TIPO        = "COMUNA O CIRCUITO"

# Verificar columnas
faltantes = [c for c in [C_ESTADO, C_MUNICIPIO, C_PARROQUIA, C_COD_COMUNA,
                          C_NOM_COMUNA, C_COD_CONSEJO, C_NOM_CONSEJO, C_TIPO]
             if c not in df.columns]
if faltantes:
    raise ValueError(f"❌ Faltan estas columnas en el Excel: {faltantes}")

# ------------------------------------------------------------
# 4. Función para limpiar comillas dobles o simples al inicio/fin
# ------------------------------------------------------------
def limpiar(texto):
    if not texto:
        return ""
    texto = str(texto).strip()
    while texto.startswith('"') or texto.startswith("'"):
        texto = texto[1:].strip()
    while texto.endswith('"') or texto.endswith("'"):
        texto = texto[:-1].strip()
    return texto

# ------------------------------------------------------------
# 5. Construir el JSON jerárquico (respetando orden del Excel)
# ------------------------------------------------------------
resultado = OrderedDict()

for _, fila in df.iterrows():
    estado    = limpiar(fila[C_ESTADO])
    municipio = limpiar(fila[C_MUNICIPIO])
    parroquia = limpiar(fila[C_PARROQUIA])

    cod_comuna = limpiar(fila[C_COD_COMUNA])
    nom_comuna = limpiar(fila[C_NOM_COMUNA])
    tipo       = limpiar(fila[C_TIPO]).upper()

    cod_consejo = limpiar(fila[C_COD_CONSEJO])
    nom_consejo = limpiar(fila[C_NOM_CONSEJO])

    # Saltar filas sin datos esenciales
    if not estado or not municipio or not parroquia:
        continue

    # Crear niveles si no existen (mantiene orden de aparición)
    resultado.setdefault(estado, OrderedDict())
    resultado[estado].setdefault(municipio, OrderedDict())
    resultado[estado][municipio].setdefault(parroquia, [])

    lista_comunas = resultado[estado][municipio][parroquia]

    # Buscar si ya existe esa comuna/circuito en la parroquia
    comuna = next(
        (c for c in lista_comunas
         if c["codigo_situr"] == cod_comuna and c["nombre"] == nom_comuna),
        None
    )

    if comuna is None:
        comuna = {
            "codigo_situr": cod_comuna,
            "nombre": nom_comuna,
            "tipo": tipo,
            "consejos_comunales": []
        }
        lista_comunas.append(comuna)

    # Agregar consejo comunal si tiene datos y no está repetido
    if nom_consejo or cod_consejo:
        existe = any(
            cc["codigo_situr"] == cod_consejo and cc["nombre"] == nom_consejo
            for cc in comuna["consejos_comunales"]
        )
        if not existe:
            comuna["consejos_comunales"].append({
                "codigo_situr": cod_consejo,
                "nombre": nom_consejo
            })

# ------------------------------------------------------------
# 6. Guardar el JSON
# ------------------------------------------------------------
salida = os.path.join(carpeta, "comunas_y_consejos.json")
with open(salida, "w", encoding="utf-8") as f:
    json.dump(resultado, f, ensure_ascii=False, indent=2)

# ------------------------------------------------------------
# 7. Resumen por consola (conteo seguro, sin errores)
# ------------------------------------------------------------
total_estados    = len(resultado)
total_municipios = 0
total_parroquias = 0
total_comunas    = 0
total_consejos   = 0

for estado in resultado.values():
    total_municipios += len(estado)
    for municipio in estado.values():
        total_parroquias += len(municipio)
        for lista_comunas in municipio.values():   # lista_comunas es una LISTA
            total_comunas += len(lista_comunas)
            for comuna in lista_comunas:           # comuna es un DICT
                total_consejos += len(comuna["consejos_comunales"])

print("")
print("✅ JSON generado correctamente")
print(f"   📄 Archivo:            {os.path.basename(salida)}")
print(f"   🌎 Estados:            {total_estados}")
print(f"   🏛️  Municipios:         {total_municipios}")
print(f"   ⛪ Parroquias:          {total_parroquias}")
print(f"   🤝 Comunas/Circuitos:  {total_comunas}")
print(f"   👥 Consejos comunales: {total_consejos}")
print("")