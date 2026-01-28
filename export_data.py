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
    res = {}
    if 'ANIO' in df.columns:
        for year in df['ANIO'].dropna().unique():
            y_str = str(int(year))
            y_df = df[df['ANIO'] == year]
            res[y_str] = {
                "registros": int(len(y_df)),
                "debe": float(y_df['DEBE'].sum()),
                "haber": float(y_df['HABER'].sum())
            }
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

        # Calcular días desde última venta y último cobro (referencia: 31-dic-2025)
        fecha_corte = pd.Timestamp('2025-12-31')
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

    # Ordenar por saldo descendente y limitar a top 2000 clientes
    clientes_data = sorted(clientes_data, key=lambda x: abs(x['saldo']) + x['total_debe'], reverse=True)
    clientes_data = clientes_data[:2000]  # Limitar para rendimiento

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
    # 3. DETALLE DE TRANSACCIONES (limitado para rendimiento)
    # ============================================
    # Incluir transacciones de todos los clientes en clientes_data (top 2000)
    # para que coincida con la lista de clientes en el frontend
    top_clientes = [c['codigo'] for c in clientes_data]
    cxc_filtered = cxc_df[cxc_df['CLIENTE_CODIGO'].isin(top_clientes)].copy()

    # Ordenar por cliente y fecha, limitar a 100 por cliente
    cxc_sorted = cxc_filtered.sort_values(['CLIENTE_CODIGO', 'FECHA'], ascending=[True, False])
    cxc_sorted = cxc_sorted.groupby('CLIENTE_CODIGO').head(100)

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
            # Patrones comunes (ordenados de más específico a menos):
            patterns = [
                # FA-serie-factura: FA-005051-257330 → captura 257330
                r'FA-\d+-(\d{5,})',
                # FA-serie-serie-factura: FA-001-001-123456 → captura 123456
                r'FA-\d+-\d+-(\d+)',
                # (FAxxxxxx): (FA223064) → captura 223064
                r'\(FA(\d{5,})\)',
                # FA-factura: FA-257330 → captura 257330
                r'FA-(\d{5,})',
                # FACT-factura: FACT-123456 → captura 123456
                r'FACT-(\d+)',
                # FA[espacio]factura: FA 257330
                r'FA\s+(\d{5,})',
            ]

            for pattern in patterns:
                match = re.search(pattern, detalle_str)
                if match:
                    return match.group(1)

            # Si no encontramos referencia a factura, usar el número de documento
            return str(doc_numero) if doc_numero else ''

        return str(doc_numero) if doc_numero else ''

    detalle = []
    for _, row in cxc_sorted.iterrows():
        detalle_text = str(row.get('DETALLE', ''))
        debe = float(row.get('DEBE', 0))
        haber = float(row.get('HABER', 0))

        # Número de documento original
        doc_numero = row.get('FACTURA', '') or row.get('NUMERO_DOCUMENTO', '') or row.get('ID_ASIENTO', '')

        # Extraer la factura correcta (para pagos, buscar en el detalle)
        factura = extraer_factura_de_detalle(detalle_text, debe, haber, doc_numero)

        detalle.append({
            "fecha": str(row.get('FECHA', ''))[:10],
            "anio": str(int(row.get('ANIO', 0))) if pd.notna(row.get('ANIO')) else '',
            "cliente_codigo": str(row.get('CUENTA', '')),
            "cliente_nombre": row.get('CLIENTE_NOMBRE', 'Sin Nombre'),
            "detalle": detalle_text,  # Detalle completo, sin truncar
            "debe": debe,
            "haber": haber,
            "tipo_doc": str(row.get('TIPO_DOCUMENTO', 'OTROS')),
            "asiento": str(row.get('ID_ASIENTO', '')),
            "factura": factura,
            "documento": str(doc_numero)  # Documento original para referencia
        })

    print(f"  - {len(clientes_data)} clientes procesados")
    print(f"  - {len(detalle)} transacciones en detalle")

    return {
        "clientes": clientes_data,
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

    data = {
        "metadata": {
            "last_update": pd.Timestamp.now().isoformat(),
            "available_years": sorted([str(int(y)) for y in df['ANIO'].dropna().unique()]) if 'ANIO' in df.columns else []
        },
        "resumen": process_resumen(df),
        "promocion": process_promocion(df),
        "cxc": process_cxc(df)
    }

    print(f"Writing to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print("Export Complete!")

if __name__ == "__main__":
    main()
