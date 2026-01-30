"""
DISOR Data Export - Version 2.0 (Optimized for Web 2.0)
Processes Parquet data from 'datos/' and generates 'dashboard_v2_data.json'.
"""

import pandas as pd
import json
import os
import re
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "datos"
PARQUET_FILE = DATA_DIR / "MAYORES_CONSOLIDADO.parquet"
MASTER_CUENTAS_FILE = DATA_DIR / "Mater Cuenta - Nombre.xlsx"
OUTPUT_FILE = BASE_DIR / "dashboard-v2" / "public" / "data" / "data.json"

# Global account name mapping
CUENTA_NOMBRES = {}

# ============================================
# NORMALIZACIÓN DE NOMBRES DE PROVEEDORES
# ============================================
# Palabras clave para identificar grupos de empresas
GRUPOS_PROVEEDORES = {
    'danec': ['danec', 'industrial danec'],
    'pydaco': ['pydaco', 'pidaco'],
    'pronaca': ['pronaca', 'procesadora nacional'],
    'nestle': ['nestle', 'nestlé'],
    'unilever': ['unilever'],
    'colgate': ['colgate'],
    'kimberly': ['kimberly', 'kimberly-clark', 'kimberly clark'],
    'procter': ['procter', 'p&g', 'procter & gamble'],
    'coca cola': ['coca cola', 'coca-cola', 'arca continental'],
    'pepsi': ['pepsi', 'pepsico'],
    'bimbo': ['bimbo'],
    'arcor': ['arcor'],
    'toni': ['toni', 'industrias toni'],
    'alpina': ['alpina'],
    'floralp': ['floralp'],
    'zaimella': ['zaimella'],
    'favalle': ['favalle'],
    'oriental': ['oriental', 'la oriental'],
    'supermaxi': ['supermaxi', 'corporacion favorita'],
    'tia': ['tia', 'tiendas industriales'],
}

# Sufijos comunes a remover para normalización
SUFIJOS_EMPRESA = [
    r'\s+s\.?a\.?s?\.?$',
    r'\s+cia\.?\s*ltda\.?$',
    r'\s+c\.?a\.?$',
    r'\s+ltda\.?$',
    r'\s+del ecuador.*$',
    r'\s+importaciones?$',
    r'\s+exportaciones?$',
    r'\s+comercial(izadora)?$',
    r'\s+distribuidora?$',
    r'\s+industrial(es)?$',
    r'\s+corp\.?$',
    r'\s+inc\.?$',
    r'\s+ec\.?$',
    r'\s*\.\.\.$',  # Puntos suspensivos al final
]

def normalizar_proveedor(nombre):
    """
    Normaliza el nombre de un proveedor para agrupar variaciones.
    Retorna una tupla (nombre_grupo, nombre_display)
    """
    if not nombre or nombre == 'Sin Nombre':
        return ('sin_nombre', 'Sin Nombre')

    # Convertir a minúsculas y limpiar
    nombre_lower = nombre.lower().strip()
    nombre_limpio = nombre_lower

    # Remover sufijos comunes
    for sufijo in SUFIJOS_EMPRESA:
        nombre_limpio = re.sub(sufijo, '', nombre_limpio, flags=re.IGNORECASE)

    nombre_limpio = nombre_limpio.strip()

    # Buscar coincidencia con grupos conocidos
    for grupo, keywords in GRUPOS_PROVEEDORES.items():
        for keyword in keywords:
            if keyword in nombre_limpio:
                # Retornar el grupo como identificador y un nombre display capitalizado
                return (grupo, grupo.title())

    # Si no hay coincidencia con grupo conocido, usar el nombre limpio
    # Capitalizar primera letra de cada palabra
    nombre_display = ' '.join(word.capitalize() for word in nombre_limpio.split())

    # Usar el nombre limpio como grupo (sin espacios, para agrupación consistente)
    nombre_grupo = re.sub(r'\s+', '_', nombre_limpio)

    return (nombre_grupo, nombre_display if nombre_display else nombre)

def load_master_cuentas():
    """Load the master account names from Excel file"""
    global CUENTA_NOMBRES
    if not MASTER_CUENTAS_FILE.exists():
        print(f"Warning: Master file {MASTER_CUENTAS_FILE} not found. Using default names.")
        return

    print(f"Loading master cuenta-nombre from {MASTER_CUENTAS_FILE}...")
    try:
        df = pd.read_excel(MASTER_CUENTAS_FILE)

        # The file has multiple columns for different years, we need to consolidate
        # Columns: CUENTA, NOMBRE, AÑO, ..., CUENTA.1, NOMBRE.1, AÑO.1, etc.
        for i in range(5):  # Up to 5 sets of columns (years 2019-2023)
            suffix = f".{i}" if i > 0 else ""
            cuenta_col = f"CUENTA{suffix}"
            nombre_col = f"NOMBRE{suffix}"

            if cuenta_col in df.columns and nombre_col in df.columns:
                for _, row in df.iterrows():
                    cuenta = row[cuenta_col]
                    nombre = row[nombre_col]
                    if pd.notna(cuenta) and pd.notna(nombre):
                        # Store as string key (account number)
                        cuenta_str = str(int(cuenta)) if isinstance(cuenta, float) else str(cuenta)
                        CUENTA_NOMBRES[cuenta_str] = str(nombre).strip()

        print(f"Loaded {len(CUENTA_NOMBRES)} account names from master file.")
    except Exception as e:
        print(f"Error loading master file: {e}")

def get_nombre_cuenta(cuenta_code, fallback_nombre=''):
    """Get account name from master, falling back to provided name or code"""
    cuenta_str = str(int(float(cuenta_code))) if cuenta_code and str(cuenta_code).replace('.', '').isdigit() else str(cuenta_code)

    # Try exact match first
    if cuenta_str in CUENTA_NOMBRES:
        return CUENTA_NOMBRES[cuenta_str]

    # If fallback provided and not empty/N/A, use it
    if fallback_nombre and fallback_nombre not in ['N/A', 'nan', '']:
        return fallback_nombre

    # Return the code itself as last resort
    return cuenta_str

def load_parquet():
    if not PARQUET_FILE.exists():
        print(f"Error: {PARQUET_FILE} not found.")
        return None
    print(f"Loading data from {PARQUET_FILE}...")
    return pd.read_parquet(PARQUET_FILE)

def get_cp_category(name, current_type):
    name = str(name).upper()
    ct = str(current_type).upper()
    if any(k in name for k in ['OFICINA', 'SUCURSAL', 'INTERNO', 'MATRIZ']):
        return 'INTERNO'
    if any(k in name for k in ['BANCO', 'BANK', 'PICHINCHA', 'GUAYAQUIL', 'PRODUBANK', 'BOLIVAR']):
        return 'BANCO'
    if 'CLIENTE' in ct or 'CLIENTE' in name: return 'CLIENTE'
    if 'PROVEEDOR' in ct or 'PROVEEDOR' in name: return 'PROVEEDOR'
    return 'OTROS'

def process_resumen(df):
    print("Processing Resumen...")
    res = {"anual": {}, "mensual": []}
    if 'ANIO' in df.columns and 'FECHA' in df.columns:
        # Ensure FECHA is datetime
        df['FECHA_DT'] = pd.to_datetime(df['FECHA'], errors='coerce')
        
        # Pre-filter for performance
        cxc_mask = df.get('ES_CXC', False) == True
        cxp_mask = df.get('ES_CXP', False) == True
        promo_mask = df.get('ES_PROMOCION', False) == True
        
        # Yearly aggregation
        for year in df['ANIO'].dropna().unique():
            y_str = str(int(year))
            y_df = df[df['ANIO'] == year]
            
            cxc_val = float(y_df[cxc_mask]['DEBE'].sum())
            cxp_val = float(y_df[cxp_mask]['HABER'].sum())
            promo_val = float(y_df[promo_mask]['DEBE'].sum())
            
            res["anual"][y_str] = {
                "registros": int(len(y_df)),
                "debe": float(y_df['DEBE'].sum()),
                "haber": float(y_df['HABER'].sum()),
                "cxc": cxc_val,
                "cxp": cxp_val,
                "promo": promo_val
            }
        
        # Monthly trend
        df['MES'] = df['FECHA_DT'].dt.month
        
        # Aggregating by month
        monthly_cxc = df[cxc_mask].groupby(['ANIO', 'MES'])['DEBE'].sum()
        monthly_cxp = df[cxp_mask].groupby(['ANIO', 'MES'])['HABER'].sum()
        monthly_promo = df[promo_mask].groupby(['ANIO', 'MES'])['DEBE'].sum()
        
        # Combine
        combined_monthly = pd.DataFrame({
            'cxc': monthly_cxc,
            'cxp': monthly_cxp,
            'promo': monthly_promo
        }).fillna(0).reset_index()
        
        for _, row in combined_monthly.sort_values(['ANIO', 'MES']).iterrows():
            res["mensual"].append({
                "label": f"{int(row['MES'])}/{int(row['ANIO'])}",
                "cxc": float(row['cxc']),
                "cxp": float(row['cxp']),
                "promo": float(row['promo'])
            })
            
    return res

def process_promocion(df):
    print("Processing Promocion...")
    promo_df = df[df.get('ES_PROMOCION', False) == True].copy()
    
    # By Year/Account - Including Debe and Haber
    by_account = {}
    cp_breakdown = {} # New: Breakdown of 'cruce'
    
    acc_col = '7. cuentas promocion' if '7. cuentas promocion' in df.columns else 'NOMBRE_CUENTA'
    
    if 'ANIO' in promo_df.columns:
        for year in promo_df['ANIO'].dropna().unique():
            y_str = str(int(year))
            y_df = promo_df[promo_df['ANIO'] == year]
            
            # 1. Basic Aggregation
            acc_agg = y_df.groupby(acc_col).agg({
                'DEBE': 'sum',
                'HABER': 'sum'
            }).to_dict('index')
            by_account[y_str] = {k: {"debe": float(v['DEBE']), "haber": float(v['HABER'])} for k, v in acc_agg.items()}
            
            # 2. Counterparty Breakdown (The 'Cruce')
            y_df['CP_TYPE_FIXED'] = y_df.apply(
                lambda x: get_cp_category(x['CONTRAPARTIDA_NOMBRE'], x['CONTRAPARTIDA_TIPO']), axis=1
            )
            
            cp_agg = y_df.groupby([acc_col, 'CP_TYPE_FIXED']).agg({
                'DEBE': 'sum',
                'HABER': 'sum'
            }).reset_index()
            
            for _, row in cp_agg.iterrows():
                acc = row[acc_col]
                cp_type = row['CP_TYPE_FIXED']
                d_val = float(row['DEBE'])
                h_val = float(row['HABER'])
                
                if acc not in cp_breakdown: cp_breakdown[acc] = {}
                if y_str not in cp_breakdown[acc]: cp_breakdown[acc][y_str] = {}
                cp_breakdown[acc][y_str][cp_type] = {
                    "debe": d_val,
                    "haber": h_val
                }

    # Recent Transactions for Table - ALL lines of journal entries
    detalle = []
    
    # Get all unique journal entries from promotion transactions
    asientos_promo = promo_df['ID_ASIENTO'].dropna().unique()
    
    # For each journal entry, export ALL lines as separate rows
    for asiento_id in asientos_promo:
        asiento_lines = df[df['ID_ASIENTO'] == asiento_id].copy()
        
        # Get the promotion line to extract metadata
        promo_line = asiento_lines[asiento_lines['ES_PROMOCION'] == True].iloc[0] if len(asiento_lines[asiento_lines['ES_PROMOCION'] == True]) > 0 else asiento_lines.iloc[0]
        
        # Get main client/provider name and type
        cp_name = str(promo_line.get('CONTRAPARTIDA_NOMBRE', 'N/A'))
        cp_type = get_cp_category(cp_name, promo_line.get('CONTRAPARTIDA_TIPO', 'N/A'))
        cuenta_promo = str(promo_line.get(acc_col, 'Otros'))
        fecha = str(promo_line.get('FECHA', ''))[:10]
        anio = str(int(promo_line.get('ANIO', 0)))
        
        # Export ALL lines of this journal entry
        for _, line in asiento_lines.iterrows():
            # Get document info from DETALLE field (more accurate)
            detalle_text = str(line.get('DETALLE', ''))
            tipo_doc = str(line.get('TIPO_DOCUMENTO', 'N/A')).strip()

            # Extract documents from DETALLE using regex
            # Patterns: FA -001006-6015857, FA-160307, NC-AUTO-1281, Ret.001012-5889
            # Note: Some have space after FA (FA -001013-2047)
            docs_list = []

            # Facturas con establecimiento: FA -001006-6015857 or FA-001006-6015857 → tomar último número
            fa_estab = re.findall(r'FA\s?-(\d+)-(\d+)', detalle_text)
            if fa_estab:
                for match in fa_estab:
                    if f"FA-{match[1]}" not in docs_list:
                        docs_list.append(f"FA-{match[1]}")

            # Facturas simples: FA-259515 or FA -259515 (5+ dígitos, sin segundo guion)
            fa_simple = re.findall(r'FA\s?-(\d{5,})(?!\d*-)', detalle_text)
            for num in fa_simple:
                if f"FA-{num}" not in docs_list:
                    docs_list.append(f"FA-{num}")

            # Notas de Crédito: NC-AUTO-1281, NC -AUTO-1281, NC-1281
            nc_matches = re.findall(r'NC\s?-(?:AUTO\s?-)?(\d+)', detalle_text)
            for num in nc_matches:
                if f"NC-{num}" not in docs_list:
                    docs_list.append(f"NC-{num}")

            # Retenciones: Ret.001012-5889 or Ret 001012-5889 → tomar último número
            ret_estab = re.findall(r'Ret[.\s]?(\d+)-(\d+)', detalle_text)
            if ret_estab:
                for match in ret_estab:
                    if f"Ret-{match[1]}" not in docs_list:
                        docs_list.append(f"Ret-{match[1]}")
            else:
                ret_simple = re.findall(r'Ret[.\s]?(\d{4,})', detalle_text)
                for num in ret_simple:
                    if f"Ret-{num}" not in docs_list:
                        docs_list.append(f"Ret-{num}")
            
            # Cheques: CH/8916, CH-1234, CH. 1234, CH 1234, CH1234
            ch_matches = re.findall(r'CH[/\-\.\s]*(\d+)', detalle_text, flags=re.IGNORECASE)
            for num in ch_matches:
                if f"CH-{num}" not in docs_list:
                    docs_list.append(f"CH-{num}")

            # Memos: MEMO A-202-23, SEG MEMO A-123-24
            memo_matches = re.findall(r'MEMO\s+([A-Z]?-?\d+-\d+)', detalle_text, flags=re.IGNORECASE)
            for ref in memo_matches:
                if f"MEMO-{ref}" not in docs_list:
                    docs_list.append(f"MEMO-{ref}")

            # Determine document types based on extracted documents AND detalle text
            tipos_doc_list = []

            # From extracted documents
            for doc in docs_list:
                if doc.startswith('FA-'):
                    if 'FACTURA' not in tipos_doc_list:
                        tipos_doc_list.append('FACTURA')
                elif doc.startswith('NC-'):
                    if 'NOTA DE CREDITO' not in tipos_doc_list:
                        tipos_doc_list.append('NOTA DE CREDITO')
                elif doc.startswith('Ret-'):
                    if 'RETENCION' not in tipos_doc_list:
                        tipos_doc_list.append('RETENCION')

            # From detalle text patterns
            detalle_upper = detalle_text.upper()

            # Cheques y Transferencias/otros
            if re.search(r'CH[/\-\.\s]*\d+', detalle_text, flags=re.IGNORECASE):
                if 'CHEQUE' not in tipos_doc_list:
                    tipos_doc_list.append('CHEQUE')

            # Reposición
            if 'REPOSICION' in detalle_upper or 'REPOSICIÓN' in detalle_upper:
                if 'REPOSICION' not in tipos_doc_list:
                    tipos_doc_list.append('REPOSICION')

            # Ajuste: REG. AJUSTE, ND-AC, ND-CP
            if 'REG. AJUSTE' in detalle_upper or 'REG.AJUSTE' in detalle_upper or 'ND-AC' in detalle_text or 'ND-CP' in detalle_text:
                if 'AJUSTE' not in tipos_doc_list:
                    tipos_doc_list.append('AJUSTE')

            # Robo
            if 'ROBO' in detalle_upper:
                if 'ROBO' not in tipos_doc_list:
                    tipos_doc_list.append('ROBO')

            # Memo
            if 'MEMO' in detalle_upper:
                if 'MEMO' not in tipos_doc_list:
                    tipos_doc_list.append('MEMO')

            # Get account name from master or fallback to NOMBRE column
            cuenta_code = line.get('CUENTA', '')
            fallback_name = str(line.get('NOMBRE', ''))
            nombre_cuenta = get_nombre_cuenta(cuenta_code, fallback_name)

            detalle.append({
                "fecha": fecha,
                "asiento": str(asiento_id),
                "cuenta": cuenta_promo,  # Main promotion account
                "cuenta_linea": str(cuenta_code) if cuenta_code else 'N/A',  # Account code of this specific line
                "nombre_cuenta_linea": nombre_cuenta,  # Account NAME from master or fallback
                "detalle": str(line.get('DETALLE', '')),  # Full detail, no truncation
                "debe": float(line.get('DEBE', 0)),
                "haber": float(line.get('HABER', 0)),
                "anio": anio,
                "contrapartida": cp_name,  # Main client/provider
                "tipo_cp": cp_type,
                "tipo_doc": ', '.join(tipos_doc_list) if tipos_doc_list else 'OTROS',
                "documentos": ', '.join(docs_list) if docs_list else 'N/A',
                "es_linea_promo": bool(line.get('ES_PROMOCION', False))
            })
    
    # Sort by date descending, then by asiento
    detalle = sorted(detalle, key=lambda x: (x['fecha'], x['asiento']), reverse=True)

    return {
        "by_account": by_account,
        "cp_breakdown": cp_breakdown,
        "detalle": detalle
    }

def process_cxc(df):
    """
    Procesa las Cuentas por Cobrar (CXC) para análisis de cartera.
    Incluye: saldos por cliente, tiempos de cobro, antigüedad, ranking.
    """
    print("Processing CXC...")

    # Filtrar solo cuentas por cobrar
    cxc_df = df[df.get('ES_CXC', False) == True].copy()

    if len(cxc_df) == 0:
        print("No CXC data found.")
        return {"clientes": [], "resumen_anual": {}, "detalle": []}

    # Asegurarse de que FECHA sea datetime
    if 'FECHA' in cxc_df.columns:
        cxc_df['FECHA'] = pd.to_datetime(cxc_df['FECHA'], errors='coerce')

    # Obtener nombre del cliente desde NOMBRE o CLIENTE columna
    cxc_df['CLIENTE_NOMBRE'] = cxc_df.apply(
        lambda x: str(x.get('CLIENTE', x.get('NOMBRE', 'Sin Nombre'))).strip(), axis=1
    )
    cxc_df['CLIENTE_NOMBRE'] = cxc_df['CLIENTE_NOMBRE'].replace(['nan', 'None', ''], 'Sin Nombre')

    # Código de cuenta del cliente
    cxc_df['CLIENTE_CODIGO'] = cxc_df['CUENTA'].astype(str)

    # ============================================
    # 1. ANÁLISIS POR CLIENTE
    # ============================================
    clientes_data = []

    for (codigo, nombre), grupo in cxc_df.groupby(['CLIENTE_CODIGO', 'CLIENTE_NOMBRE']):
        # Totales
        total_debe = grupo['DEBE'].sum()  # Ventas/Cargos
        total_haber = grupo['HABER'].sum()  # Cobros/Abonos
        saldo = total_debe - total_haber

        # Conteo de transacciones
        num_ventas = len(grupo[grupo['DEBE'] > 0])
        num_cobros = len(grupo[grupo['HABER'] > 0])

        # Fechas
        primera_venta = grupo[grupo['DEBE'] > 0]['FECHA'].min()
        ultima_venta = grupo[grupo['DEBE'] > 0]['FECHA'].max()
        ultimo_cobro = grupo[grupo['HABER'] > 0]['FECHA'].max()

        # Calcular días desde última venta y último cobro (referencia: 31-dic-2023)
        fecha_corte = pd.Timestamp('2023-12-31')
        dias_sin_venta = (fecha_corte - ultima_venta).days if pd.notna(ultima_venta) else None
        dias_sin_cobro = (fecha_corte - ultimo_cobro).days if pd.notna(ultimo_cobro) else None

        # Promedio de días entre venta y cobro (simplificado)
        # Usamos la diferencia entre última venta y último cobro como proxy
        dias_promedio_cobro = None
        if pd.notna(ultima_venta) and pd.notna(ultimo_cobro) and ultimo_cobro >= primera_venta:
            # Calcular promedio basado en el flujo general
            if total_haber > 0 and total_debe > 0:
                # Proxy: días entre primera venta y proporción cobrada
                dias_activo = (max(ultima_venta, ultimo_cobro) - primera_venta).days
                if dias_activo > 0:
                    tasa_cobro = total_haber / total_debe if total_debe > 0 else 0
                    dias_promedio_cobro = int(dias_activo * (1 - tasa_cobro)) if tasa_cobro < 1 else 30

        # Años activos
        anios_activos = sorted(grupo['ANIO'].dropna().unique().astype(int).tolist())

        # Desglose por año
        por_anio = {}
        for anio in anios_activos:
            anio_df = grupo[grupo['ANIO'] == anio]
            por_anio[str(anio)] = {
                "debe": float(anio_df['DEBE'].sum()),
                "haber": float(anio_df['HABER'].sum()),
                "saldo": float(anio_df['DEBE'].sum() - anio_df['HABER'].sum()),
                "num_transacciones": len(anio_df)
            }

        clientes_data.append({
            "codigo": codigo,
            "nombre": nombre if nombre != 'Sin Nombre' else get_nombre_cuenta(codigo, nombre),
            "total_debe": float(total_debe),
            "total_haber": float(total_haber),
            "saldo": float(saldo),
            "num_ventas": num_ventas,
            "num_cobros": num_cobros,
            "primera_venta": str(primera_venta)[:10] if pd.notna(primera_venta) else None,
            "ultima_venta": str(ultima_venta)[:10] if pd.notna(ultima_venta) else None,
            "ultimo_cobro": str(ultimo_cobro)[:10] if pd.notna(ultimo_cobro) else None,
            "dias_sin_venta": dias_sin_venta,
            "dias_sin_cobro": dias_sin_cobro,
            "dias_promedio_cobro": dias_promedio_cobro,
            "anios_activos": anios_activos,
            "por_anio": por_anio
        })

    # Ordenar por saldo descendente
    clientes_data = sorted(clientes_data, key=lambda x: abs(x['saldo']) + x['total_debe'], reverse=True)
    clientes_data = clientes_data[:40000]  # Aumentado de 5000 a 40000 para cubrir todos los clientes (21k+)

    # ============================================
    # 2. RESUMEN ANUAL
    # ============================================
    resumen_anual = {}
    for anio in cxc_df['ANIO'].dropna().unique():
        anio_str = str(int(anio))
        anio_df = cxc_df[cxc_df['ANIO'] == anio]

        total_debe = anio_df['DEBE'].sum()
        total_haber = anio_df['HABER'].sum()

        # Clientes activos (con movimiento)
        clientes_con_debe = anio_df[anio_df['DEBE'] > 0]['CLIENTE_CODIGO'].nunique()
        clientes_con_haber = anio_df[anio_df['HABER'] > 0]['CLIENTE_CODIGO'].nunique()

        resumen_anual[anio_str] = {
            "total_debe": float(total_debe),
            "total_haber": float(total_haber),
            "saldo_neto": float(total_debe - total_haber),
            "clientes_con_ventas": clientes_con_debe,
            "clientes_con_cobros": clientes_con_haber,
            "num_transacciones": len(anio_df)
        }

    # ============================================
    # 3. DETALLE DE TRANSACCIONES (MODIFICADO: Incluye contrapartidas)
    # ============================================
    print("  Processing CXC transactions and related lines...")
    top_clientes = [c['codigo'] for c in clientes_data]

    import re

    def extraer_factura_de_detalle(detalle_text, debe, haber, doc_numero):
        """
        Extrae el número de factura del detalle.
        - Para ventas (DEBE > 0): usar el número de documento
        - Para pagos (HABER > 0): buscar referencia a factura en el detalle (FA-XXXXX, FACT-XXXXX)
        """
        detalle_str = str(detalle_text) if detalle_text else ''

        if debe > 0:
            # Es una venta/factura - usar su propio número
            return str(doc_numero) if doc_numero else ''

        if haber > 0:
            # Es un pago/cobro - buscar la factura que está pagando
            patterns = [
                r'FA-\d+-(\d{5,})',
                r'FA-\d+-\d+-(\d+)',
                r'\(FA(\d{5,})\)',
                r'FA-(\d{5,})',
                r'FACT[A-Z]*\s*[.-]?\s*(\d+)', # FACT-112080 o FACTURA-112080
                r'FA\s+(\d{5,})',
            ]
            for pattern in patterns:
                match = re.search(pattern, detalle_str)
                if match:
                    return match.group(1)
            return str(doc_numero) if doc_numero else ''
        return str(doc_numero) if doc_numero else ''

    # 1. Identificar facturas y sus clientes en los registros ES_CXC
    factura_cliente_map = {}
    asiento_cliente_map = {}  # Map directo asiento -> cliente (más rápido)
    asientos_cxc_ids = cxc_df['ID_ASIENTO'].unique()
    
    # 2. Obtener todos los registros de los mismos asientos para ver contrapartidas (Bancos, IVA, etc.)
    cxc_relacionados = df[df['ID_ASIENTO'].isin(asientos_cxc_ids)].copy()
    
    # Map (asiento, factura) -> (codigo, nombre) y asiento -> (codigo, nombre)
    for _, row in cxc_df.iterrows():
        fac = extraer_factura_de_detalle(row.get('DETALLE', ''), row.get('DEBE', 0), row.get('HABER', 0), row.get('FACTURA', ''))
        asiento = row.get('ID_ASIENTO')
        cliente_info = (str(row['CLIENTE_CODIGO']), str(row['CLIENTE_NOMBRE']))
        
        if fac and asiento:
            factura_cliente_map[(asiento, fac)] = cliente_info
        if asiento:
            asiento_cliente_map[asiento] = cliente_info  # Fallback directo por asiento

    # 3. Procesar todos los registros relacionados
    detalle = []
    top_clientes_set = set(top_clientes)
    
    # Ordenar por asiento para procesar agrupado
    cxc_completo = cxc_relacionados.sort_values(['ID_ASIENTO', 'FECHA'], ascending=[True, False])

    for _, row in cxc_completo.iterrows():
        asiento = row.get('ID_ASIENTO')
        detalle_text = str(row.get('DETALLE', ''))
        debe = float(row.get('DEBE', 0))
        haber = float(row.get('HABER', 0))
        doc_numero = row.get('FACTURA', '') or row.get('NUMERO_DOCUMENTO', '') or row.get('ID_ASIENTO', '')
        
        # Encontrar a qué factura pertenece este registro buscando en el mismo asiento
        # O extrayendo del detalle
        factura = extraer_factura_de_detalle(detalle_text, debe, haber, doc_numero)
        
        # Intentar obtener cliente desde el mapa del asiento
        cliente_info = factura_cliente_map.get((asiento, factura))
        if not cliente_info:
            # Usar el mapa directo de asiento (mucho más rápido)
            cliente_info = asiento_cliente_map.get(asiento)
        
        if not cliente_info:
            continue
            
        codigo_cli, nombre_cli = cliente_info
        
        # Solo incluir si el cliente está en el top para rendimiento
        if codigo_cli not in top_clientes_set:
            continue

        cuenta_code = str(row.get('CUENTA', ''))
        fallback_name = str(row.get('NOMBRE', ''))
        nombre_cuenta = get_nombre_cuenta(cuenta_code, fallback_name)

        detalle.append({
            "fecha": str(row.get('FECHA', ''))[:10],
            "anio": str(int(row.get('ANIO', 0))) if pd.notna(row.get('ANIO')) else '',
            "cliente_codigo": codigo_cli,
            "cliente_nombre": nombre_cli,
            "cuenta": cuenta_code,
            "cuenta_nombre": nombre_cuenta,
            "detalle": detalle_text[:300],
            "debe": debe,
            "haber": haber,
            "tipo_doc": str(row.get('TIPO_DOCUMENTO', 'OTROS')),
            "asiento": str(asiento),
            "factura": factura,
            "documento": str(doc_numero),
            "es_cxc": bool(row.get('ES_CXC', False))
        })

    print(f"  - {len(clientes_data)} clientes procesados")
    print(f"  - {len(detalle)} transacciones en detalle (incluyendo contrapartidas)")

    return {
        "clientes": clientes_data,
        "resumen_anual": resumen_anual,
        "detalle": detalle
    }


def extraer_nombre_proveedor_detalle(detalle):
    """
    Extrae el nombre del proveedor desde el campo DETALLE.
    Busca patrones como:
    - Ret.001021-6146 Pydaco Cia. Ltda. Compra De Mercaderia
    - FA-001013-112080 PYDACO CIA. LTDA.
    """
    if not detalle or pd.isna(detalle):
        return None

    detalle_str = str(detalle)

    # Patrón 1: Nombre después de retención (Ret.xxx-xxxx NOMBRE Compra/Pago)
    match = re.search(r'Ret\.\d+-\d+\s+(.+?)\s+(?:Compra|Pago|Devol)', detalle_str, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Patrón 2: Nombre después de factura (FA-xxx-xxxxx NOMBRE)
    match = re.search(r'FA\s*-\s*\d+-\d+\s+([A-Za-z][\w\s\.\,\&]+?)(?:\s*$|\s+\d)', detalle_str, re.IGNORECASE)
    if match:
        nombre = match.group(1).strip()
        # Limpiar sufijos comunes
        nombre = re.sub(r'\s*,?\s*$', '', nombre)
        return nombre

    return None

def process_cxp(df):
    """
    Procesa las Cuentas por Pagar (CXP) para análisis de proveedores.
    En CXP: HABER = compras (deuda), DEBE = pagos
    Saldo = HABER - DEBE = lo que debemos

    NUEVO: Incluye todas las cuentas que referencian facturas CXP en DETALLE
    """
    print("Processing CXP...")

    # 1. Obtener cuentas CXP principales (para proveedores y totales)
    cxp_df = df[df.get('ES_CXP', False) == True].copy()

    # 2. Obtener TODOS los registros que referencien facturas CXP en DETALLE
    # Esto permite ver cómo se paga una factura (OP, retenciones, etc.)
    import re
    def tiene_referencia_cxp(detalle):
        if pd.isna(detalle):
            return False
        detalle_str = str(detalle)
        patterns = [
            r'CxP-FA',
            r'CXP-FA',
            r'FA\s*-\s*\d{3,}-\d+',  # FA-001013-112080
            r'CH[/\-\.\s]+\d+',      # Referencia a cheques
        ]
        for p in patterns:
            if re.search(p, detalle_str, re.IGNORECASE):
                return True
        return False

    # Registros adicionales que referencian CXP (para ver pagos de facturas)
    cxp_relacionados = df[df['DETALLE'].apply(tiene_referencia_cxp)].copy()
    
    # NUEVO: Grabar TODOS los registros de los asientos que tengan algo de CXP
    asientos_cxp_ids = pd.unique(pd.concat([
        cxp_df['ID_ASIENTO'].dropna(),
        cxp_relacionados['ID_ASIENTO'].dropna()
    ])).tolist()
    
    cxp_completo_raw = df[df['ID_ASIENTO'].isin(asientos_cxp_ids)].copy()
    
    print(f"  - {len(cxp_df)} registros ES_CXP, {len(cxp_relacionados)} registros relacionados")
    print(f"  - {len(cxp_completo_raw)} registros totales en asientos CXP")

    if len(cxp_df) == 0:
        print("No CXP data found.")
        return {"proveedores": [], "resumen_anual": {}, "detalle": []}

    # Asegurarse de que FECHA sea datetime
    if 'FECHA' in cxp_df.columns:
        cxp_df['FECHA'] = pd.to_datetime(cxp_df['FECHA'], errors='coerce')

    # Obtener nombre del proveedor - intentar extraer desde DETALLE si es código genérico
    def get_proveedor_nombre(row):
        proveedor = str(row.get('PROVEEDOR', '')).strip()
        # Si es un código genérico como "PROVEEDOR_00001", extraer nombre del DETALLE
        if proveedor.startswith('PROVEEDOR_') or proveedor in ['nan', 'None', '', 'Sin Nombre']:
            nombre_detalle = extraer_nombre_proveedor_detalle(row.get('DETALLE', ''))
            if nombre_detalle:
                return nombre_detalle
        return proveedor if proveedor not in ['nan', 'None', ''] else 'Sin Nombre'

    cxp_df['PROVEEDOR_NOMBRE'] = cxp_df.apply(get_proveedor_nombre, axis=1)

    # Código de cuenta del proveedor
    cxp_df['PROVEEDOR_CODIGO'] = cxp_df['CUENTA'].astype(str)

    # Aplicar normalización para agrupar proveedores similares
    cxp_df['PROVEEDOR_GRUPO'], cxp_df['PROVEEDOR_DISPLAY'] = zip(*cxp_df['PROVEEDOR_NOMBRE'].apply(normalizar_proveedor))

    # ============================================
    # 1. ANÁLISIS POR PROVEEDOR (AGRUPADO)
    # ============================================
    proveedores_data = []

    # Agrupar por nombre normalizado en lugar de código individual
    for (grupo_id, nombre_display), grupo in cxp_df.groupby(['PROVEEDOR_GRUPO', 'PROVEEDOR_DISPLAY']):
        # Totales - en CXP es inverso a CXC
        total_haber = grupo['HABER'].sum()  # Compras/Cargos (lo que debemos)
        total_debe = grupo['DEBE'].sum()    # Pagos/Abonos (lo que pagamos)
        saldo = total_haber - total_debe    # Saldo pendiente (positivo = debemos)

        # Conteo de transacciones
        num_compras = len(grupo[grupo['HABER'] > 0])
        num_pagos = len(grupo[grupo['DEBE'] > 0])

        # Fechas
        primera_compra = grupo[grupo['HABER'] > 0]['FECHA'].min()
        ultima_compra = grupo[grupo['HABER'] > 0]['FECHA'].max()
        ultimo_pago = grupo[grupo['DEBE'] > 0]['FECHA'].max()

        # Calcular días desde última compra y último pago (referencia: 31-dic-2023)
        fecha_corte = pd.Timestamp('2023-12-31')
        dias_sin_compra = (fecha_corte - ultima_compra).days if pd.notna(ultima_compra) else None
        dias_sin_pago = (fecha_corte - ultimo_pago).days if pd.notna(ultimo_pago) else None

        # Promedio de días para pagar
        dias_promedio_pago = None
        if pd.notna(ultima_compra) and pd.notna(ultimo_pago) and ultimo_pago >= primera_compra:
            if total_debe > 0 and total_haber > 0:
                dias_activo = (max(ultima_compra, ultimo_pago) - primera_compra).days
                if dias_activo > 0:
                    tasa_pago = total_debe / total_haber if total_haber > 0 else 0
                    dias_promedio_pago = int(dias_activo * (1 - tasa_pago)) if tasa_pago < 1 else int(dias_activo / (num_pagos or 1))

        # Años con actividad
        anios_activos = sorted(grupo['ANIO'].dropna().unique().tolist())

        # Totales por año
        por_anio = {}
        for anio in anios_activos:
            anio_grupo = grupo[grupo['ANIO'] == anio]
            por_anio[str(anio)] = {
                "compras": float(anio_grupo['HABER'].sum()),
                "pagos": float(anio_grupo['DEBE'].sum())
            }

        # Obtener lista de cuentas originales agrupadas
        cuentas_originales = grupo['PROVEEDOR_CODIGO'].unique().tolist()

        proveedores_data.append({
            "codigo": str(grupo_id),  # Usar el grupo normalizado como código
            "nombre": str(nombre_display),  # Nombre display normalizado
            "cuentas_originales": cuentas_originales,  # Lista de cuentas agrupadas
            "compras": float(total_haber),
            "pagos": float(total_debe),
            "saldo": float(saldo),
            "num_compras": num_compras,
            "num_pagos": num_pagos,
            "primera_compra": str(primera_compra)[:10] if pd.notna(primera_compra) else None,
            "ultima_compra": str(ultima_compra)[:10] if pd.notna(ultima_compra) else None,
            "ultimo_pago": str(ultimo_pago)[:10] if pd.notna(ultimo_pago) else None,
            "dias_sin_compra": dias_sin_compra,
            "dias_sin_pago": dias_sin_pago,
            "dias_promedio_pago": dias_promedio_pago,
            "anios_activos": anios_activos,
            "por_anio": por_anio
        })

    # Ordenar por saldo (lo que más debemos primero)
    proveedores_data.sort(key=lambda x: x['saldo'], reverse=True)
    proveedores_data = proveedores_data[:2000]  # Top 2000 proveedores

    # ============================================
    # 2. RESUMEN ANUAL
    # ============================================
    resumen_anual = {}
    for anio in cxp_df['ANIO'].dropna().unique():
        anio_str = str(int(anio))
        anio_df = cxp_df[cxp_df['ANIO'] == anio]

        total_compras = anio_df['HABER'].sum()
        total_pagos = anio_df['DEBE'].sum()

        proveedores_con_compras = anio_df[anio_df['HABER'] > 0]['PROVEEDOR_CODIGO'].nunique()
        proveedores_con_pagos = anio_df[anio_df['DEBE'] > 0]['PROVEEDOR_CODIGO'].nunique()

        resumen_anual[anio_str] = {
            "total_compras": float(total_compras),
            "total_pagos": float(total_pagos),
            "saldo_neto": float(total_compras - total_pagos),
            "proveedores_con_compras": proveedores_con_compras,
            "proveedores_con_pagos": proveedores_con_pagos,
            "num_transacciones": len(anio_df)
        }

    # ============================================
    # 3. DETALLE DE TRANSACCIONES (TODOS LOS REGISTROS RELACIONADOS)
    # ============================================
    # Extraer facturas de los registros ES_CXP para mapeo
    def extraer_factura_de_detalle(detalle):
        if pd.isna(detalle):
            return None
        detalle_str = str(detalle)
        patterns = [
            r'FA\s*-\s*\d+-(\d{5,})',     # FA-001011-21724
            r'CxP-FA\s*-\s*\d+-(\d+)',    # CxP-FA-001011-21724
            r'FACT\s*[.-]?\s*(\d{5,})',   # FACT-12345
            r'FAC\s*[.-]?\s*(\d{5,})',    # FAC-12345
        ]
        for p in patterns:
            match = re.search(p, detalle_str, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    # Crear mapeos para asignar proveedor a las contrapartidas
    factura_proveedor_map = {}
    asiento_proveedor_map = {}
    
    for _, row in cxp_df.iterrows():
        fac = extraer_factura_de_detalle(row.get('DETALLE', ''))
        asiento = row.get('ID_ASIENTO')
        prov_info = (row['PROVEEDOR_GRUPO'], row['PROVEEDOR_DISPLAY'])
        
        if fac and pd.notna(row.get('PROVEEDOR_GRUPO')):
            factura_proveedor_map[fac] = prov_info
        if asiento and pd.notna(row.get('PROVEEDOR_GRUPO')):
            asiento_proveedor_map[asiento] = prov_info

    print(f"  - {len(factura_proveedor_map)} facturas y {len(asiento_proveedor_map)} asientos mapeados a proveedores")

    # Usar el dataframe completo de asientos relacionados
    cxp_completo = cxp_completo_raw.copy()
    if 'FECHA' in cxp_completo.columns:
        cxp_completo['FECHA'] = pd.to_datetime(cxp_completo['FECHA'], errors='coerce')
    
    cxp_completo['PROVEEDOR_GRUPO'] = None
    cxp_completo['PROVEEDOR_DISPLAY'] = None

    # Asignar proveedor basado en la factura referenciada en DETALLE o en el asiento
    for idx, row in cxp_completo.iterrows():
        fac = extraer_factura_de_detalle(row.get('DETALLE', ''))
        asiento = row.get('ID_ASIENTO')
        
        if fac and fac in factura_proveedor_map:
            grupo, display = factura_proveedor_map[fac]
            cxp_completo.at[idx, 'PROVEEDOR_GRUPO'] = grupo
            cxp_completo.at[idx, 'PROVEEDOR_DISPLAY'] = display
        elif asiento and asiento in asiento_proveedor_map:
            # Si el asiento es conocido, asignamos ese proveedor (muy útil para pagos-cheque)
            grupo, display = asiento_proveedor_map[asiento]
            cxp_completo.at[idx, 'PROVEEDOR_GRUPO'] = grupo
            cxp_completo.at[idx, 'PROVEEDOR_DISPLAY'] = display
        else:
            cxp_completo.at[idx, 'PROVEEDOR_GRUPO'] = 'otros'
            cxp_completo.at[idx, 'PROVEEDOR_DISPLAY'] = 'Otros'

    # Ordenar por asiento y fecha
    cxp_sorted = cxp_completo.sort_values(['ID_ASIENTO', 'CUENTA', 'FECHA'], ascending=[True, True, True])

    def detectar_tipo_documento(detalle_text, tipo_doc_original):
        """
        Detecta el tipo de documento desde el campo DETALLE.
        Retorna (tipo_doc, numero_doc)
        """
        detalle_str = str(detalle_text) if detalle_text else ''
        tipo_original = str(tipo_doc_original) if tipo_doc_original else ''

        # Registro: REG. RECLASIFICACION o similar
        if detalle_str.upper().startswith('REG.') or detalle_str.upper().startswith('REG '):
            return 'REG', None

        # Orden de Pago: OP-[5022] o OP.[5022] o OP 5022
        match = re.search(r'OP[\-\.\[\s]+(\d+)', detalle_str, re.IGNORECASE)
        if match:
            return 'OP', match.group(1)

        # Cheque: CH/17529 o CH-1234
        match = re.search(r'CH[/\-\.\s]+(\d+)', detalle_str, re.IGNORECASE)
        if match:
            return 'CH', match.group(1)

        # Retención: Ret.001021-6146 o RET-xxxx
        match = re.search(r'Ret[\.\-]?\s*(\d+[\-\d]*)', detalle_str, re.IGNORECASE)
        if match:
            return 'RET', match.group(1)

        # Nota de Crédito: NC-DEVO, NC-DESC, NC-xxx o N/C-xxx
        if re.search(r'NC[\-\s]*(DEVO|DESC|DEVOL)', detalle_str, re.IGNORECASE):
            return 'NC', None
        match = re.search(r'N[/]?C[\-\.\s]+(\d+)', detalle_str, re.IGNORECASE)
        if match:
            return 'NC', match.group(1)

        # Nota de Débito: ND-xxx o N/D-xxx
        match = re.search(r'N[/]?D[\-\.\s]+(\d+)', detalle_str, re.IGNORECASE)
        if match:
            return 'ND', match.group(1)

        # CXP con factura
        if 'CXP' in detalle_str.upper() or 'CxP' in detalle_str:
            return 'CXP', None

        # Si tiene FA- es factura
        if re.search(r'FA\s*-', detalle_str, re.IGNORECASE):
            return 'CXP', None

        # Usar el tipo original si existe y no es vacío
        if tipo_original and tipo_original not in ['', 'nan', 'N/A']:
            return tipo_original, None

        return 'OTROS', None

    def extraer_factura_proveedor(detalle_text, haber, debe, doc_numero):
        """
        Extrae el número de factura del detalle para CXP.
        - Para compras (HABER > 0): buscar referencia a factura
        - Para pagos (DEBE > 0): buscar la factura que estamos pagando
        """
        detalle_str = str(detalle_text) if detalle_text else ''

        # Patrones comunes para facturas de proveedor (con espacios opcionales)
        patterns = [
            r'FA\s*-\s*\d+-(\d{5,})',     # FA-001011-21724 o FA -001011-21724
            r'CxP-FA\s*-\s*\d+-(\d+)',    # CxP-FA-001011-21724 o CxP-FA -001011-21724
            r'FACT\s*[.-]?\s*(\d{5,})',   # FACT-12345 o FACT.12345
            r'FAC\s*[.-]?\s*(\d{5,})',    # FAC-12345
        ]

        for pattern in patterns:
            match = re.search(pattern, detalle_str, re.IGNORECASE)
            if match:
                return match.group(1)

        return str(doc_numero) if doc_numero else ''

    detalle = []
    for _, row in cxp_sorted.iterrows():
        doc_numero = row.get('NUMERO_DOCUMENTO') or row.get('NUMERO', '')
        detalle_text = row.get('DETALLE', '')
        factura = extraer_factura_proveedor(
            detalle_text,
            row.get('HABER', 0),
            row.get('DEBE', 0),
            doc_numero
        )

        # Detectar tipo de documento y número desde el DETALLE
        tipo_doc_original = row.get('TIPO_DOCUMENTO', row.get('TIPO', ''))
        tipo_doc, doc_detectado = detectar_tipo_documento(detalle_text, tipo_doc_original)

        # Usar el documento detectado si existe, sino el original
        documento_final = doc_detectado if doc_detectado else str(doc_numero)

        # Obtener cuenta contable y su nombre desde el master
        cuenta_contable = str(row.get('CUENTA', ''))
        cuenta_nombre = get_nombre_cuenta(cuenta_contable, str(row.get('NOMBRE', '')))

        detalle.append({
            "proveedor_codigo": str(row['PROVEEDOR_GRUPO']),  # Usar grupo normalizado
            "proveedor_nombre": str(row['PROVEEDOR_DISPLAY']),  # Usar nombre normalizado
            "cuenta": cuenta_contable,  # Cuenta contable del registro
            "cuenta_nombre": cuenta_nombre,  # Nombre de la cuenta desde master
            "fecha": str(row['FECHA'])[:10] if pd.notna(row['FECHA']) else '',
            "anio": str(int(row['ANIO'])) if pd.notna(row['ANIO']) else '',
            "tipo_doc": tipo_doc,
            "documento": documento_final,
            "factura": factura,
            "asiento": str(row.get('ID_ASIENTO', row.get('NUMERO', ''))),
            "detalle": str(detalle_text)[:500],
            "compra": float(row['HABER']) if row['HABER'] > 0 else 0,
            "pago": float(row['DEBE']) if row['DEBE'] > 0 else 0,
            "es_cxp": bool(row.get('ES_CXP', False))  # Indicador de si es cuenta CXP principal
        })

    print(f"  - {len(proveedores_data)} proveedores procesados")
    print(f"  - {len(detalle)} transacciones en detalle")

    return {
        "proveedores": proveedores_data,
        "resumen_anual": resumen_anual,
        "detalle": detalle
    }


def main():
    # Load master cuenta-nombre first
    load_master_cuentas()

    df = load_parquet()
    if df is None: return

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Get available years
    available_years = sorted([str(int(y)) for y in df['ANIO'].dropna().unique()]) if 'ANIO' in df.columns else []

    # Process all data
    cxc_data = process_cxc(df)
    cxp_data = process_cxp(df)

    # === ARCHIVO PRINCIPAL (sin detalle de transacciones) ===
    main_data = {
        "metadata": {
            "last_update": pd.Timestamp.now().isoformat(),
            "available_years": available_years
        },
        "resumen": process_resumen(df),
        "promocion": process_promocion(df),
        "cxc": {
            "clientes": cxc_data["clientes"],
            "resumen_anual": cxc_data["resumen_anual"],
            "detalle": []  # Detalle se carga por año
        },
        "cxp": {
            "proveedores": cxp_data["proveedores"],
            "resumen_anual": cxp_data["resumen_anual"],
            "detalle": []  # Detalle se carga por año
        }
    }

    print(f"Writing main file to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(main_data, f, ensure_ascii=False)

    # === ARCHIVOS DE DETALLE POR AÑO ===
    data_dir = OUTPUT_FILE.parent

    # CXC detalle por año
    cxc_detalle = cxc_data["detalle"]
    for year in available_years:
        year_detalle = [d for d in cxc_detalle if d.get("anio") == year]
        if year_detalle:
            year_file = data_dir / f"cxc_{year}.json"
            print(f"  Writing CXC {year}: {len(year_detalle)} transacciones...")
            with open(year_file, 'w', encoding='utf-8') as f:
                json.dump(year_detalle, f, ensure_ascii=False)

    # CXP detalle por año
    cxp_detalle = cxp_data["detalle"]
    for year in available_years:
        year_detalle = [d for d in cxp_detalle if d.get("anio") == year]
        if year_detalle:
            year_file = data_dir / f"cxp_{year}.json"
            print(f"  Writing CXP {year}: {len(year_detalle)} transacciones...")
            with open(year_file, 'w', encoding='utf-8') as f:
                json.dump(year_detalle, f, ensure_ascii=False)

    print("Export Complete!")

if __name__ == "__main__":
    main()
