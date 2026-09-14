import os
import re
import zipfile
import tempfile
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
        if url.endswith(".csv") or url.endswith(".zip"):
            match = re.search(r"\b(201\d|202\d)\b", name)
            anio = int(match.group(1)) if match else 0
            archivos.append({"anio": anio, "name": name, "url": url})
            
    if not archivos:
        raise RuntimeError("No se encontraron recursos CSV/ZIP en el dataset.")
        
    archivos.sort(key=lambda x: x["anio"], reverse=True)
    seleccionado = archivos[0]
    print(f"Archivo seleccionado: {seleccionado['name']} -> {seleccionado['url']}")
    return seleccionado


def descargar_y_obtener_csv(url: str, temp_dir: str) -> str:
    """Descarga el recurso y, si es un zip, extrae el archivo CSV contenido."""
    local_path = os.path.join(temp_dir, "descarga_dnrpa")
    print(f"Descargando archivo desde: {url}...")
    
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    
    print("Descarga finalizada.")

    # Si es ZIP, descomprimir y buscar el CSV
    if url.endswith(".zip") or zipfile.is_zipfile(local_path):
        print("Descomprimiendo archivo ZIP...")
        with zipfile.ZipFile(local_path, "r") as z:
            z.extractall(temp_dir)
            for file_name in z.namelist():
                if file_name.lower().endswith(".csv"):
                    ruta_csv = os.path.join(temp_dir, file_name)
                    print(f"CSV encontrado y extraído: {ruta_csv}")
                    return ruta_csv
        raise RuntimeError("No se encontró ningún archivo .csv dentro del ZIP.")
    
    return local_path


def procesar_y_cargar(ruta_csv_local: str):
    """Procesa el CSV local con DuckDB, agrupa los datos y los sube a Supabase."""
    print(f"Iniciando procesamiento DuckDB sobre: {ruta_csv_local}")
    con = duckdb.connect(database=":memory:")
    
    query = f"""
        SELECT 
            YEAR(TRY_CAST(tramite_fecha AS DATE)) AS anio,
            MONTH(TRY_CAST(tramite_fecha AS DATE)) AS mes,
            UPPER(TRIM(automotor_marca_descripcion)) AS marca,
            COALESCE(UPPER(TRIM(automotor_modelo_descripcion)), 'SIN ESPECIFICAR') AS modelo,
            COALESCE(automotor_origen, 'Sin Dato') AS origen,
            COALESCE(UPPER(TRIM(titular_radicacion_provincia)), 'NO ESPECIFICADA') AS provincia,
            COUNT(*) AS cantidad
        FROM read_csv_auto('{ruta_csv_local}', ignore_errors=true)
        WHERE tramite_fecha IS NOT NULL 
          AND automotor_marca_descripcion IS NOT NULL
          AND TRY_CAST(tramite_fecha AS DATE) IS NOT NULL
        GROUP BY 1, 2, 3, 4, 5, 6
    """
    
    df_resumen = con.execute(query).fetchdf()
    con.close()
    
    total_filas = len(df_resumen)
    print(f"Procesamiento finalizado. Filas agrupadas a insertar: {total_filas}")
    
    if total_filas == 0:
        print("No se generaron registros. Verificá los encabezados del archivo.")
        return

    registros = df_resumen.to_dict(orient="records")
    tamano_batch = 1000
    for i in range(0, total_filas, tamano_batch):
        batch = registros[i:i + tamano_batch]
        supabase.table("patentamientos_resumen").insert(batch).execute()
        print(f"Insertados {min(i + tamano_batch, total_filas)}/{total_filas} registros...")

    print("Carga completa en Supabase con éxito.")


if __name__ == "__main__":
    recurso = obtener_ultimo_archivo()
    with tempfile.TemporaryDirectory() as temp_dir:
        csv_path = descargar_y_obtener_csv(recurso["url"], temp_dir)
        procesar_y_cargar(csv_path)
