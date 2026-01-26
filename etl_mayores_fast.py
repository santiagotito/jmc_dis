import pandas as pd
import numpy as np
import re
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm

# Configuración de rutas
BASE_DIR = r"c:\Users\Santi\OneDrive\HERRAMIENTAS\8. DISOR - POWER BI\datos"
OUTPUT_FILE = os.path.join(BASE_DIR, "MAYORES_CONSOLIDADO.parquet")
MASTER_FILE = os.path.join(BASE_DIR, "Mater Cuenta - Nombre.xlsx")

FILES_CONFIG = [
    {"name": "Libro Mayor_2019_DISOR.xlsx", "sheet": "MAYORES AUXILIARES DISOR AÑO 20"},
    {"name": "Libro Mayor_2020_DISOR.xlsx", "sheet": "cuenauxiDISOR2020"},
    {"name": "Libro Mayor_2021_DISOR.xlsx", "sheet": "MAYORES AUXILIARES DISOR AÑO 20"},
    {"name": "Libro Mayor_2022_DISOR.xlsx", "sheet": "MAYORESAUXILIARESDISOR2022"},
    {"name": "Libro Mayor_2023_DISOR.xlsx", "sheet": "Hoja1"},
]

def load_master_cuentas():
    """Carga el Master de Cuentas y crea un diccionario CUENTA -> NOMBRE."""
    try:
        master = pd.read_excel(MASTER_FILE, sheet_name='4. MASTER DE MAYORES')
        # Renombrar columnas para evitar problemas de encoding
        master.columns = ['CUENTA', 'NOMBRE', 'ANIO_MASTER']
        # Filtrar solo los que tienen nombre
        master = master[master['NOMBRE'].notna()]
        # Crear diccionario, priorizando años más recientes (2023 > 2022 > etc.)
        master = master.sort_values('ANIO_MASTER', ascending=False)
        # Convertir CUENTA a string para el mapeo
        master['CUENTA'] = master['CUENTA'].astype(str)
        master_dict = master.drop_duplicates(subset='CUENTA', keep='first').set_index('CUENTA')['NOMBRE'].to_dict()
        print(f"Master de cuentas cargado: {len(master_dict):,} cuentas con nombre")
        return master_dict
    except Exception as e:
        print(f"Error cargando Master de Cuentas: {e}")
        return {}

def load_excel(config):
    file_path = os.path.join(BASE_DIR, config["name"])
    try:
        # Usamos calamine si está disponible para mayor velocidad
        df = pd.read_excel(file_path, sheet_name=config["sheet"], engine="calamine")
    except Exception as e:
        print(f"Error cargando con calamine ({config['name']}): {e}. Reintentando con openpyxl...")
        df = pd.read_excel(file_path, sheet_name=config["sheet"])
    
    # Filtrado básico inicial para reducir memoria
    if 'ANIO' in df.columns:
        df = df[df['ANIO'].notnull()]
    return df

def vectorize_logic(df, master_dict=None):
    """Aplica la lógica de negocio de forma vectorizada (mucho más rápido que apply)."""

    # Asegurar que DETALLE sea string y manejar nulos
    df['DETALLE'] = df['DETALLE'].fillna('').astype(str)

    # --- ENRIQUECIMIENTO DE NOMBRES DESDE MASTER ---
    if master_dict:
        df['CUENTA_STR'] = df['CUENTA'].astype(str)
        # Solo llenar nombres vacíos/nan
        mask_sin_nombre = df['NOMBRE'].isna() | (df['NOMBRE'].astype(str).str.strip() == '')
        df.loc[mask_sin_nombre, 'NOMBRE'] = df.loc[mask_sin_nombre, 'CUENTA_STR'].map(master_dict)

    # --- FLAGS DE TIPO DE CUENTA ---
    df['CUENTA_STR'] = df['CUENTA'].astype(str)
    df['ES_CXC'] = df['CUENTA_STR'].str.startswith('1010205')  # Clientes
    df['ES_CXP'] = df['CUENTA_STR'].str.startswith('201')       # Proveedores
    df['ES_BANCO'] = df['CUENTA_STR'].str.startswith('10101')   # Bancos
    df['ES_PROMOCION'] = df['CUENTA_STR'].str.startswith('5020111')  # Todas las cuentas de Promociones y Publicidad
    
    # Inicializar columnas con None o NaN
    df['TIPO_DOCUMENTO'] = None
    df['NUMERO_DOCUMENTO'] = None
    df['FECHA_DOCUMENTO'] = pd.NaT
    df['NUMERO_CLIENTE'] = None
    df['NOMBRE_CLIENTE'] = None
    df['FACTURA'] = None

    # --- FACTURAS ---
    mask_fact = df['DETALLE'].str.startswith("FACT")
    df.loc[mask_fact, 'TIPO_DOCUMENTO'] = "FACTURA"
    df.loc[mask_fact, 'NUMERO_DOCUMENTO'] = df.loc[mask_fact, 'DETALLE'].str.extract(r"FACT-(\d+)", expand=False)
    df.loc[mask_fact, 'FACTURA'] = df.loc[mask_fact, 'NUMERO_DOCUMENTO']
    
    # Extraer fecha
    fechas_fact = df.loc[mask_fact, 'DETALLE'].str.extract(r"(\d{2}/\d{2}/\d{4})", expand=False)
    df.loc[mask_fact, 'FECHA_DOCUMENTO'] = pd.to_datetime(fechas_fact, format="%d/%m/%Y", errors='coerce')
    
    # Cliente (Optimización de split)
    def fast_client_extract(s):
        parts = s.split("-")
        if len(parts) >= 2:
            nom = parts[-1].strip()
            # código suele estar antes del último guión
            nom_ext_parts = parts[-2].split()
            num = nom_ext_parts[-1] if nom_ext_parts else None
            return num, nom
        return None, None

    # Solo aplicamos split a las filas que son FACTURA (aún así es mucho mejor que el apply general)
    if mask_fact.any():
        client_data = df.loc[mask_fact, 'DETALLE'].apply(fast_client_extract)
        df.loc[mask_fact, 'NUMERO_CLIENTE'] = client_data.str[0]
        df.loc[mask_fact, 'NOMBRE_CLIENTE'] = client_data.str[1]

    # --- RECAUDO ---
    mask_reca = df['DETALLE'].str.startswith("[RECA]")
    df.loc[mask_reca, 'TIPO_DOCUMENTO'] = "RECAUDO"
    df.loc[mask_reca, 'NUMERO_DOCUMENTO'] = df.loc[mask_reca, 'DETALLE'].str.extract(r"-(\d+)\s", expand=False)
    df.loc[mask_reca, 'FACTURA'] = df.loc[mask_reca, 'DETALLE'].str.extract(r"FA-(\d+)", expand=False)
    
    fechas_reca = df.loc[mask_reca, 'DETALLE'].str.extract(r"\[RECA\]\s*(\d{2}/\d{2}/\d{4})", expand=False)
    df.loc[mask_reca, 'FECHA_DOCUMENTO'] = pd.to_datetime(fechas_reca, format="%d/%m/%Y", errors='coerce')

    # --- NC ---
    mask_nc = df['DETALLE'].str.startswith("NC-")
    df.loc[mask_nc, 'TIPO_DOCUMENTO'] = "NOTA DE CREDITO"
    df.loc[mask_nc, 'NUMERO_DOCUMENTO'] = df.loc[mask_nc, 'DETALLE'].str.extract(r"NC-AUTO-(\d+)", expand=False)
    df.loc[mask_nc, 'FACTURA'] = df.loc[mask_nc, 'DETALLE'].str.extract(r"FA-(\d+)", expand=False)
    
    fechas_nc = df.loc[mask_nc, 'DETALLE'].str.extract(r"(\d{2}/\d{2}/\d{4})", expand=False)
    df.loc[mask_nc, 'FECHA_DOCUMENTO'] = pd.to_datetime(fechas_nc, format="%d/%m/%Y", errors='coerce')

    # --- DEVOLUCION ---
    mask_devo = df['DETALLE'].str.startswith("DEVO-")
    df.loc[mask_devo, 'TIPO_DOCUMENTO'] = "DEVOLUCIÓN"
    df.loc[mask_devo, 'NUMERO_DOCUMENTO'] = df.loc[mask_devo, 'DETALLE'].str.extract(r"DEVO-(\d+)", expand=False)
    df.loc[mask_devo, 'FACTURA'] = df.loc[mask_devo, 'DETALLE'].str.extract(r"\(FA\s*(\d+)\)", expand=False)
    
    fechas_devo = df.loc[mask_devo, 'DETALLE'].str.extract(r"(\d{2}/\d{2}/\d{4})", expand=False)
    df.loc[mask_devo, 'FECHA_DOCUMENTO'] = pd.to_datetime(fechas_devo, format="%d/%m/%Y", errors='coerce')
    
    # Cliente en DEVO: split por guión y tomar el último
    df.loc[mask_devo, 'NOMBRE_CLIENTE'] = df.loc[mask_devo, 'DETALLE'].str.split("-").str[-1].str.strip()

    # --- NUEVAS CATEGORÍAS (DESCOMPOSICION AVANZADA) ---
    
    # 1. SALDOS INICIALES
    mask_si = df['DETALLE'].str.contains("Saldos Iniciales", case=False, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_si, 'TIPO_DOCUMENTO'] = "SALDOS INICIALES"

    # 2. DEPÓSITOS
    mask_depo = df['DETALLE'].str.contains("Depo.", case=False, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_depo, 'TIPO_DOCUMENTO'] = "DEPÓSITO"
    df.loc[mask_depo, 'NUMERO_DOCUMENTO'] = df.loc[mask_depo, 'DETALLE'].str.extract(r"Depo\.\s*(\d+)", flags=re.IGNORECASE, expand=False)
    fechas_depo = df.loc[mask_depo, 'DETALLE'].str.extract(r"(\d{2}/\d{2}/\d{4})", expand=False)
    df.loc[mask_depo, 'FECHA_DOCUMENTO'] = pd.to_datetime(fechas_depo, format="%d/%m/%Y", errors='coerce')

    # 3. RETENCIONES (CLIENTE Y OTRAS)
    mask_ret = df['DETALLE'].str.contains(r"RETCLI|RET\.", case=True, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_ret, 'TIPO_DOCUMENTO'] = "RETENCIÓN"
    df.loc[mask_ret, 'NUMERO_DOCUMENTO'] = df.loc[mask_ret, 'DETALLE'].str.extract(r"RET(?:CLI)?-?(\d+)", flags=re.IGNORECASE, expand=False)

    # 4. CUENTAS POR PAGAR (CXP)
    mask_cxp = df['DETALLE'].str.contains("CxP-", case=False, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_cxp, 'TIPO_DOCUMENTO'] = "CXP"
    df.loc[mask_cxp, 'FACTURA'] = df.loc[mask_cxp, 'DETALLE'].str.extract(r"FA\s*-?(\d+)", flags=re.IGNORECASE, expand=False)
    df.loc[mask_cxp, 'NUMERO_DOCUMENTO'] = df.loc[mask_cxp, 'FACTURA']

    # 5. CHEQUES
    mask_ch = df['DETALLE'].str.contains(r"Ch[/\-\.\s0-9]", case=False, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_ch, 'TIPO_DOCUMENTO'] = "CHEQUE"
    # Extraer solo el número, permitiendo formatos como CH/8916, CH 8916, CH-8916 o CH8916
    df.loc[mask_ch, 'NUMERO_DOCUMENTO'] = df.loc[mask_ch, 'DETALLE'].str.extract(r"Ch[/\-\.\s]*(\d+)", flags=re.IGNORECASE, expand=False)

    # 6. CRUCES
    mask_cruce = df['DETALLE'].str.contains("Cruce", case=False, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_cruce, 'TIPO_DOCUMENTO'] = "CRUCE"
    df.loc[mask_cruce, 'NUMERO_DOCUMENTO'] = df.loc[mask_cruce, 'DETALLE'].str.extract(r"Cruce\s*(\d+)", flags=re.IGNORECASE, expand=False)

    # 7. TRANSFERENCIAS
    mask_trans = df['DETALLE'].str.contains(r"Transf|Transferencia", case=False, na=False) & df['TIPO_DOCUMENTO'].isna()
    df.loc[mask_trans, 'TIPO_DOCUMENTO'] = "TRANSFERENCIA"

    # Clasificar el resto como 'OTROS' para TIPO_DOCUMENTO
    df['TIPO_DOCUMENTO'] = df['TIPO_DOCUMENTO'].fillna("OTROS")

    # --- FORMA DE PAGO (para análisis CxP) ---
    df['FORMA_PAGO'] = None
    # Cheque
    mask_pago_ch = df['DETALLE'].str.contains(r'Ch\.|Cheque', case=False, na=False)
    df.loc[mask_pago_ch, 'FORMA_PAGO'] = 'CHEQUE'
    # Transferencia
    mask_pago_tr = df['DETALLE'].str.contains(r'Transf|Transfer', case=False, na=False) & df['FORMA_PAGO'].isna()
    df.loc[mask_pago_tr, 'FORMA_PAGO'] = 'TRANSFERENCIA'
    # Depósito
    mask_pago_dep = df['DETALLE'].str.contains(r'Depo\.|Deposito|Depósito', case=False, na=False) & df['FORMA_PAGO'].isna()
    df.loc[mask_pago_dep, 'FORMA_PAGO'] = 'DEPOSITO'
    # Cruce
    mask_pago_cruce = df['DETALLE'].str.contains(r'Cruce', case=False, na=False) & df['FORMA_PAGO'].isna()
    df.loc[mask_pago_cruce, 'FORMA_PAGO'] = 'CRUCE'
    # Nota de Crédito
    mask_pago_nc = df['DETALLE'].str.contains(r'NC-|N\.C\.|Nota.?Cr', case=False, na=False) & df['FORMA_PAGO'].isna()
    df.loc[mask_pago_nc, 'FORMA_PAGO'] = 'NOTA_CREDITO'
    # Retención
    mask_pago_ret = df['DETALLE'].str.contains(r'RET|Retenc', case=False, na=False) & df['FORMA_PAGO'].isna()
    df.loc[mask_pago_ret, 'FORMA_PAGO'] = 'RETENCION'
    df['FORMA_PAGO'] = df['FORMA_PAGO'].fillna('OTROS')

    # --- EXTRACCIÓN DE PROVEEDOR/CLIENTE DESDE NOMBRE DE CUENTA ---
    # Para CxC: El nombre de cuenta suele ser el nombre del cliente
    df['CLIENTE'] = None
    df.loc[df['ES_CXC'], 'CLIENTE'] = df.loc[df['ES_CXC'], 'NOMBRE']
    # Si no hay nombre, intentar extraer del código de cuenta (últimos dígitos)
    mask_cliente_vacio = df['ES_CXC'] & (df['CLIENTE'].isna() | (df['CLIENTE'].astype(str) == 'nan'))
    df.loc[mask_cliente_vacio, 'CLIENTE'] = 'CLIENTE_' + df.loc[mask_cliente_vacio, 'CUENTA_STR'].str[-5:]

    # Para CxP: Similar, el nombre de cuenta es el proveedor
    df['PROVEEDOR'] = None
    df.loc[df['ES_CXP'], 'PROVEEDOR'] = df.loc[df['ES_CXP'], 'NOMBRE']
    mask_prov_vacio = df['ES_CXP'] & (df['PROVEEDOR'].isna() | (df['PROVEEDOR'].astype(str) == 'nan'))
    df.loc[mask_prov_vacio, 'PROVEEDOR'] = 'PROVEEDOR_' + df.loc[mask_prov_vacio, 'CUENTA_STR'].str[-5:]

    # --- LÓGICA DE CUENTAS PROMOCION ---
    cuentas_map = {
        "502011101003": "Promociones Ventas Lago Agrio",
        "502011101001": "Publicidad Ventas Lago Agrio",
        "502011103003": "Promociones Ventas Portoviejo",
        "502011102003": "Promociones Ventas Quevedo",
        "502011105003": "Promociones Ventas Sto. Dgo.",
        "502011104001": "Publicidad Sucursal Quito"
    }
    df['CUENTA_STR'] = df['CUENTA'].astype(str)
    df['7. cuentas promocion'] = df['CUENTA_STR'].map(cuentas_map).fillna("otros")
    
    # --- LÓGICA DE 5. FACTURA (Vectorizada) ---
    # Limpiar solo números y guiones de FACT_RAW
    def clean_vectorized(s):
        if pd.isna(s) or s == '': return ""
        return "".join([c for c in str(s) if c.isdigit() or c == "-"]).strip("-")

    df['FACT_CLEAN'] = df['FACTURA'].apply(clean_vectorized)
    
    # np.select para mayor eficiencia en condiciones múltiples
    conditions = [
        (df['FACT_CLEAN'] != ""),
        (df['7. cuentas promocion'] != "otros")
    ]
    choices = [
        df['FACT_CLEAN'],
        "SIN FACTURA"
    ]
    df['5. Factura'] = np.select(conditions, choices, default="OTROS")

    # --- ENRIQUECIMIENTO PARA ANÁLISIS DE NEGOCIO ---
    
    # 1. ID_ASIENTO Único (Año + Número)
    # Convertimos a string para evitar sumas matemáticas
    df['ID_ASIENTO'] = df['ANIO'].astype(str) + "_" + df['NUMERO'].astype(str)

    # 2. NATURALEZA Y FACTOR DE MOVIMIENTO
    # 1xx: Activo (Deudora)
    # 2xx: Pasivo (Acreedor)
    # 3xx: Patrimonio (Acreedor)
    # 4xx: Ingresos (Acreedor)
    # 5xx: Gastos (Deudora)
    # 6xx: Costos (Deudora)
    
    def get_naturaleza(cuenta):
        c = str(cuenta)
        if c.startswith('1') or c.startswith('5') or c.startswith('6'):
            return 'DEUDORA', 1  # DEBE suma, HABER resta
        else:
            return 'ACREEDORA', -1 # HABER suma, DEBE resta

    # Aplicación eficiente
    naturalezas = df['CUENTA'].apply(get_naturaleza)
    df['NATURALEZA'] = naturalezas.str[0]
    df['FACTOR_NAT'] = naturalezas.str[1]
    
    # Diferencia neta según naturaleza (para saldo por fila)
    # Para deudoras: DEBE - HABER
    # Para acreedoras: HABER - DEBE
    df['MOVIMIENTO_NETO'] = np.where(df['NATURALEZA'] == 'DEUDORA', 
                                     df['DEBE'] - df['HABER'], 
                                     df['HABER'] - df['DEBE'])

    # Limpieza final
    cols_to_drop = ['FACT_CLEAN']
    df.drop(columns=[c for c in cols_to_drop if c in df.columns], inplace=True)

    return df


def agregar_contrapartidas_promocion(df):
    """
    Para cada registro de promoción, identifica las contrapartidas del mismo asiento.
    Esto permite ver a quién/qué se le aplicó la promoción.
    """
    print("Calculando contrapartidas de promoción...")

    # Inicializar columnas
    df['CONTRAPARTIDA_CUENTA'] = None
    df['CONTRAPARTIDA_NOMBRE'] = None
    df['CONTRAPARTIDA_TIPO'] = None
    df['CLIENTE_PROMOCION'] = None

    # Obtener asientos que tienen promoción
    asientos_con_promo = df[df['ES_PROMOCION']]['ID_ASIENTO'].unique()
    print(f"  Asientos con promoción: {len(asientos_con_promo):,}")

    # Para eficiencia, procesamos por lotes
    batch_size = 10000
    for i in range(0, len(asientos_con_promo), batch_size):
        batch_asientos = asientos_con_promo[i:i+batch_size]

        for asiento_id in batch_asientos:
            mask_asiento = df['ID_ASIENTO'] == asiento_id
            asiento_df = df[mask_asiento]

            # Registros de promoción en este asiento (DEBE)
            promo_rows = asiento_df[asiento_df['ES_PROMOCION'] & (asiento_df['DEBE'] > 0)]
            # Contrapartidas (HABER) - típicamente cuentas de clientes
            contra_rows = asiento_df[(asiento_df['HABER'] > 0) & ~asiento_df['ES_PROMOCION']]

            if len(promo_rows) > 0 and len(contra_rows) > 0:
                # Obtener info de contrapartidas (puede haber varias)
                contra_cuentas = contra_rows['CUENTA_STR'].unique()
                contra_nombres = contra_rows['NOMBRE'].dropna().unique()
                contra_tipos = []

                # Identificar tipo de contrapartida
                if contra_rows['ES_CXC'].any():
                    contra_tipos.append('CLIENTE')
                if contra_rows['ES_CXP'].any():
                    contra_tipos.append('PROVEEDOR')
                if contra_rows['ES_BANCO'].any():
                    contra_tipos.append('BANCO')
                if not contra_tipos:
                    contra_tipos.append('OTRA')

                # Obtener nombre del cliente si es CxC
                clientes = contra_rows[contra_rows['ES_CXC']]['CLIENTE'].dropna().unique()

                # Asignar a registros de promoción
                mask_promo_asiento = mask_asiento & df['ES_PROMOCION']
                df.loc[mask_promo_asiento, 'CONTRAPARTIDA_CUENTA'] = ';'.join(contra_cuentas[:5])  # Max 5
                df.loc[mask_promo_asiento, 'CONTRAPARTIDA_NOMBRE'] = ';'.join([str(n) for n in contra_nombres[:3]])
                df.loc[mask_promo_asiento, 'CONTRAPARTIDA_TIPO'] = ';'.join(contra_tipos)
                if len(clientes) > 0:
                    df.loc[mask_promo_asiento, 'CLIENTE_PROMOCION'] = ';'.join([str(c) for c in clientes[:3]])

        if i % 50000 == 0 and i > 0:
            print(f"  Procesados {i:,} asientos...")

    print("  Contrapartidas calculadas.")
    return df

def process_data():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando ETL mejorado para análisis contable...")

    # Cargar Master de Cuentas para enriquecer nombres
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Cargando Master de Cuentas...")
    master_dict = load_master_cuentas()

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Cargando archivos Excel en paralelo...")
    with ThreadPoolExecutor() as executor:
        dataframes = list(tqdm(executor.map(load_excel, FILES_CONFIG), total=len(FILES_CONFIG), desc="Cargando Excels"))

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Combinando dataframes...")
    combined_df = pd.concat(dataframes, ignore_index=True)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Aplicando lógica vectorizada...")
    combined_df = vectorize_logic(combined_df, master_dict)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Calculando contrapartidas de promoción...")
    combined_df = agregar_contrapartidas_promocion(combined_df)

    # Estadísticas de validación
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] === ESTADÍSTICAS ===")
    print(f"  Total registros: {len(combined_df):,}")
    print(f"  Registros CxC: {combined_df['ES_CXC'].sum():,}")
    print(f"  Registros CxP: {combined_df['ES_CXP'].sum():,}")
    print(f"  Registros Promoción: {combined_df['ES_PROMOCION'].sum():,}")
    print(f"  Con contrapartida identificada: {combined_df['CONTRAPARTIDA_TIPO'].notna().sum():,}")

    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Preparando tipos para Parquet...")
    # Forzar conversión a string de todas las columnas objeto para evitar problemas de Arrow
    for col in combined_df.columns:
        if combined_df[col].dtype == 'object':
            # Reemplazar representaciones de nulos por vacío para mejor visualización
            combined_df[col] = combined_df[col].astype(str).replace(['None', 'nan', 'NaN', 'N/A'], '')
        elif pd.api.types.is_datetime64_any_dtype(combined_df[col]):
            pass # Mantener fechas como tal
            
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Guardando en Parquet: {OUTPUT_FILE}")
    combined_df.to_parquet(OUTPUT_FILE, index=False, engine='pyarrow', compression='snappy')
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ¡ETL completado con éxito!")
    print(f"Total registros procesados: {len(combined_df):,}")

if __name__ == "__main__":
    process_data()
