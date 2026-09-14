import os
import re
import requests
import duckdb
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
CKAN_PACKAGE_URL = "https://datos.jus.gob.ar/api/3/action/package_show?id=inscripciones-iniciales-de-autos"


def obtener_ultimo_archivo():
    """Consulta la API de Datos Abiertos de Justicia para obtener el recurso más reciente."""
    print("Consultando API CKAN de datos.jus.gob.ar...")
    resp = requests.get(CKAN_PACKAGE_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    
    recursos = data.get("result", {}).get("resources", [])
    archivos = []
    
    for r in recursos:
        url = r.get("url", "")
        name = r.get("name", "")
        # Filtrar archivos CSV o ZIP
        if url.endswith(".csv") or url.endswith(".zip"):
            match = re.search(r"\b(201\d|202\d)\b", name)
            anio = int(match.group(1)) if match else 0
            archivos.append({"anio": anio, "name": name, "url": url})
            
    if not archivos:
        raise RuntimeError("No se encontraron recursos CSV/ZIP en el dataset.")
        
    # Ordenar por año más reciente
    archivos.sort(key=lambda x: x["anio"], reverse=True)
    seleccionado = archivos[0]
    print(f"Archivo seleccionado: {seleccionado['name']} -> {seleccionado['url']}")
    return seleccionado


def procesar_y_cargar(url_archivo: str):
    """Descarga por streaming en memoria con DuckDB, agrupa los datos y los sube a Supabase."""
    print(f"Iniciando procesamiento DuckDB de: {url_archivo}")
    con = duckdb.connect(database=":memory:")
    
    # Query de agregación: de cientos de miles de filas a solo combinaciones únicas agrupadas
    query = f"""
        SELECT 
            YEAR(TRY_CAST(tramite_fecha AS DATE)) AS anio,
            MONTH(TRY_CAST(tramite_fecha AS DATE)) AS mes,
            UPPER(TRIM(automotor_marca_descripcion)) AS marca,
            COALESCE(UPPER(TRIM(automotor_modelo_descripcion)), 'SIN ESPECIFICAR') AS modelo,
            COALESCE(automotor_origen, 'Sin Dato') AS origen,
            COALESCE(UPPER(TRIM(titular_radicacion_provincia)), 'NO ESPECIFICADA') AS provincia,
            COUNT(*) AS cantidad
        FROM read_csv_auto('{url_archivo}', ignore_errors=true)
        WHERE tramite_fecha IS NOT NULL 
          AND automotor_marca_descripcion IS NOT NULL
          AND TRY_CAST(tramite_fecha AS DATE) IS NOT NULL
        GROUP BY 1, 2, 3, 4, 5, 6
    """
    
    df_resumen = con.execute(query).fetchdf()
    con.close()
    
    total_filas = len(df_resumen)
    print(f"Procesamiento finalizado. Total de registros agrupados a insertar: {total_filas}")
    
    if total_filas == 0:
        print("No se generaron registros. Verificá la estructura del archivo fuente.")
        return

    # Convertir a lista de diccionarios para inserción
    registros = df_resumen.to_dict(orient="records")
    
    # Inserción en lotes (batches) de 1.000 para optimizar el throughput de la API de Supabase
    tamano_batch = 1000
    for i in range(0, total_filas, tamano_batch):
        batch = registros[i:i + tamano_batch]
        supabase.table("patentamientos_resumen").insert(batch).execute()
        print(f"Subidos {min(i + tamano_batch, total_filas)}/{total_filas} registros...")

    print("Carga completa en Supabase con éxito.")


if __name__ == "__main__":
    recurso = obtener_ultimo_archivo()
    procesar_y_cargar(recurso["url"])
