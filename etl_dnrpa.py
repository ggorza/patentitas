import os
import re
import zipfile
import tempfile
import traceback
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
    local_path = os.path.join(temp_dir, "descarga_dnrpa")
    print(f"Descargando archivo desde: {url}...")
    
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    
    print("Descarga finalizada.")

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
    print(f"Iniciando inspección y procesamiento DuckDB sobre: {ruta_csv_local}")
    con = duckdb.connect(database=":memory:")
    
    try:
        print("Mapeando columnas del CSV...")
        df_muestra = con.execute(
            f"SELECT * FROM read_csv_auto('{ruta_csv_local}', sample_size=5000, ignore_errors=true) LIMIT 3"
        ).fetchdf()
        columnas_reales = [str(c).lower() for c in df_muestra.columns]
        print(f"Columnas detectadas en el CSV: {columnas_reales}")

        col_fecha = next((c for c in df_muestra.columns if 'fecha' in c.lower()), 'tramite_fecha')
        col_marca = next((c for c in df_muestra.columns if 'marca' in c.lower()), 'automotor_marca_descripcion')
        col_modelo = next((c for c in df_muestra.columns if 'modelo' in c.lower()), 'automotor_modelo_descripcion')
        col_origen = next((c for c in df_muestra.columns if 'origen' in c.lower()), 'automotor_origen')
        col_prov = next((c for c in df_muestra.columns if 'provincia' in c.lower()), 'titular_radicacion_provincia')

        print(f"Columnas mapeadas -> Fecha: {col_fecha}, Marca: {col_marca}, Modelo: {col_modelo}, Origen: {col_origen}, Prov: {col_prov}")

        query = (
            "WITH raw_data AS ("
            "    SELECT "
            f"       TRY_CAST(\"{col_fecha}\" AS DATE) AS fecha_parsed,"
            f"       UPPER(TRIM(\"{col_marca}\")) AS marca,"
            f"       COALESCE(UPPER(TRIM(\"{col_modelo}\")), 'SIN ESPECIFICAR') AS modelo,"
            f"       COALESCE(\"{col_origen}\", 'Sin Dato') AS origen,"
            f"       COALESCE(UPPER(TRIM(\"{col_prov}\")), 'NO ESPECIFICADA') AS provincia "
            f"   FROM read_csv_auto('{ruta_csv_local}', sample_size=5000, ignore_errors=true)"
            ") "
            "SELECT "
            "    CAST(YEAR(fecha_parsed) AS INTEGER) AS anio, "
            "    CAST(MONTH(fecha_parsed) AS INTEGER) AS mes, "
            "    marca, "
            "    modelo, "
            "    origen, "
            "    provincia, "
            "    CAST(COUNT(*) AS INTEGER) AS cantidad "
            "FROM raw_data "
            "WHERE fecha_parsed IS NOT NULL "
            "  AND marca IS NOT NULL "
            "  AND marca != '' "
            "GROUP BY 1, 2, 3, 4, 5, 6"
        )
        
        print("Ejecutando consulta de agregación...")
        df_resumen = con.execute(query).fetchdf()
        
        total_filas = len(df_resumen)
        print(f"Procesamiento finalizado. Filas agrupadas a insertar: {total_filas}")
        
        if total_filas == 0:
            print("AVISO: No se generaron registros. Verificá la fecha parseada.")
            return

        df_resumen['anio'] = df_resumen['anio'].astype(int)
        df_resumen['mes'] = df_resumen['mes'].astype(int)
        df_resumen['cantidad'] = df_resumen['cantidad'].astype(int)
        
        registros = df_resumen.to_dict(orient="records")
        tamano_batch = 1000
        for i in range(0, total_filas, tamano_batch):
            batch = registros[i:i + tamano_batch]
            supabase.table("patentamientos_resumen").insert(batch).execute()
            print(f"Insertados {min(i + tamano_batch, total_filas)}/{total_filas} registros...")

        print("Carga completa en Supabase con éxito.")

    except Exception as e:
        print("ERROR CRÍTICO durante el procesamiento o inserción:")
        traceback.print_exc()
        raise e
    finally:
        con.close()


if __name__ == "__main__":
    recurso = obtener_ultimo_archivo()
    with tempfile.TemporaryDirectory() as temp_dir:
        csv_path = descargar_y_obtener_csv(recurso["url"], temp_dir)
        procesar_y_cargar(csv_path)
