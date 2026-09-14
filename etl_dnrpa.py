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

# Rango histórico
ANIO_DESDE = 2018


def obtener_todos_los_archivos():
    print(f"Consultando catálogo CKAN para recursos desde {ANIO_DESDE}...")
    resp = requests.get(CKAN_PACKAGE_URL, timeout=45)
    resp.raise_for_status()
    data = resp.json()

    recursos = data.get("result", {}).get("resources", [])
    archivos = []

    for r in recursos:
        url = r.get("url", "")
        name = r.get("name", "")
        if url.endswith(".csv") or url.endswith(".zip"):
            match = re.search(r"\b(201\d|202\d)\b", name) or re.search(r"(201\d|202\d)", url)
            if match:
                anio = int(match.group(1))
                if anio >= ANIO_DESDE:
                    archivos.append({"anio": anio, "name": name, "url": url})

    # Ordenar cronológicamente por año y nombre de archivo
    archivos.sort(key=lambda x: (x["anio"], x["name"]))
    print(f"Total de archivos/meses detectados para procesar: {len(archivos)}")
    for a in archivos:
        print(f" - {a['name']} ({a['anio']})")
    return archivos


def descargar_y_obtener_csv(url: str, temp_dir: str) -> list:
    """Descarga el recurso y devuelve una lista de rutas a archivos CSV extraídos."""
    local_path = os.path.join(temp_dir, "descarga_temp")
    print(f"Descargando: {url}...")

    with requests.get(url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=2 * 1024 * 1024):
                if chunk:
                    f.write(chunk)

    csv_paths = []
    if url.endswith(".zip") or zipfile.is_zipfile(local_path):
        print("Extrayendo ZIP...")
        with zipfile.ZipFile(local_path, "r") as z:
            z.extractall(temp_dir)
            for file_name in z.namelist():
                if file_name.lower().endswith(".csv"):
                    csv_paths.append(os.path.join(temp_dir, file_name))
    elif local_path.lower().endswith(".csv") or url.endswith(".csv"):
        csv_paths.append(local_path)

    return csv_paths


def procesar_y_cargar(ruta_csv_local: str, etiqueta: str):
    print(f"DuckDB analizando archivo: {os.path.basename(ruta_csv_local)} [{etiqueta}]")
    con = duckdb.connect(database=":memory:")

    try:
        df_muestra = con.execute(
            f"SELECT * FROM read_csv_auto('{ruta_csv_local}', sample_size=5000, ignore_errors=true) LIMIT 3"
        ).fetchdf()
        columnas = list(df_muestra.columns)

        def buscar_col(preferidas, fallback):
            for pref in preferidas:
                for col in columnas:
                    if col.lower() == pref.lower():
                        return col
            for col in columnas:
                if fallback.lower() in col.lower() and 'codigo' not in col.lower() and 'anio' not in col.lower():
                    return col
            return columnas[0]

        col_fecha = buscar_col(['tramite_fecha', 'fecha_tramite'], 'fecha')
        col_marca = buscar_col(['automotor_marca_descripcion', 'marca_descripcion', 'marca'], 'marca')
        col_modelo = buscar_col(['automotor_modelo_descripcion', 'modelo_descripcion', 'modelo'], 'modelo')
        col_origen = buscar_col(['automotor_origen', 'origen'], 'origen')
        col_prov = buscar_col(['titular_radicacion_provincia', 'provincia'], 'provincia')

        query = (
            "WITH raw_data AS ("
            "    SELECT "
            f"       TRY_CAST(\"{col_fecha}\" AS DATE) AS fecha_parsed,"
            f"       UPPER(TRIM(CAST(\"{col_marca}\" AS VARCHAR))) AS marca,"
            f"       COALESCE(UPPER(TRIM(CAST(\"{col_modelo}\" AS VARCHAR))), 'SIN ESPECIFICAR') AS modelo,"
            f"       COALESCE(CAST(\"{col_origen}\" AS VARCHAR), 'Sin Dato') AS origen,"
            f"       COALESCE(UPPER(TRIM(CAST(\"{col_prov}\" AS VARCHAR))), 'NO ESPECIFICADA') AS provincia "
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

        df_resumen = con.execute(query).fetchdf()
        total_filas = len(df_resumen)

        if total_filas == 0:
            print(f"Sin registros válidos en {os.path.basename(ruta_csv_local)}.")
            return

        df_resumen['anio'] = df_resumen['anio'].astype(int)
        df_resumen['mes'] = df_resumen['mes'].astype(int)
        df_resumen['cantidad'] = df_resumen['cantidad'].astype(int)

        registros = df_resumen.to_dict(orient="records")
        tamano_batch = 1000
        for i in range(0, total_filas, tamano_batch):
            batch = registros[i:i + tamano_batch]
            supabase.table("patentamientos_resumen").insert(batch).execute()

        print(f"Insertadas {total_filas} filas agrupadas de {os.path.basename(ruta_csv_local)}.")

    except Exception as e:
        print(f"Error procesando {ruta_csv_local}:")
        traceback.print_exc()
    finally:
        con.close()


if __name__ == "__main__":
    archivos = obtener_todos_los_archivos()

    # Purgar tabla para evitar duplicar datos de corridas anteriores
    print("Vaciando tabla patentamientos_resumen para carga completa limpia...")
    supabase.table("patentamientos_resumen").delete().neq("id", 0).execute()

    for item in archivos:
        print(f"\nProcesando recurso: {item['name']} ({item['anio']})")
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                csv_list = descargar_y_obtener_csv(item["url"], temp_dir)
                for csv_path in csv_list:
                    procesar_y_cargar(csv_path, item["name"])
            except Exception as err:
                print(f"Fallo descarga/extracción de {item['name']}: {err}")

    print("\nCarga masiva histórica finalizada exitosamente.")
