"""
DISOR Data Export - Version 2.0 (Optimized for Web 2.0)
Processes Parquet data from 'datos/' and generates 'dashboard_v2_data.json'.
"""

import pandas as pd
import json
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "datos"
PARQUET_FILE = DATA_DIR / "MAYORES_CONSOLIDADO.parquet"
OUTPUT_FILE = BASE_DIR / "dashboard-v2" / "public" / "data" / "data.json"

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
            # Get document info
            factura = str(line.get('FACTURA', '')).strip()
            tipo_doc = str(line.get('TIPO_DOCUMENTO', 'N/A')).strip()
            num_doc = str(line.get('NUMERO_DOCUMENTO', '')).strip()
            
            # Format documents
            docs_list = []
            if factura and factura != 'nan':
                docs_list.append(f"FA-{factura}")
            if num_doc and num_doc != 'nan':
                docs_list.append(f"{num_doc}")
            
            detalle.append({
                "fecha": fecha,
                "asiento": str(asiento_id),
                "cuenta": cuenta_promo,  # Main promotion account
                "cuenta_linea": str(line.get('CUENTA', 'N/A')),  # Account code of this specific line
                "nombre_cuenta_linea": str(line.get('NOMBRE', 'N/A')),  # Account NAME of this line
                "detalle": str(line.get('DETALLE', '')),  # Full detail, no truncation
                "debe": float(line.get('DEBE', 0)),
                "haber": float(line.get('HABER', 0)),
                "anio": anio,
                "contrapartida": cp_name,  # Main client/provider
                "tipo_cp": cp_type,
                "tipo_doc": tipo_doc,
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

def main():
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
        "promocion": process_promocion(df)
    }

    print(f"Writing to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print("Export Complete!")

if __name__ == "__main__":
    main()
