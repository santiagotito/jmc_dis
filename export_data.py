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

    # Recent Transactions for Table
    detalle = []
    cols = ['FECHA', 'ID_ASIENTO', 'DETALLE', 'DEBE', 'HABER', '7. cuentas promocion', 
            'ANIO', 'CONTRAPARTIDA_NOMBRE', 'CONTRAPARTIDA_TIPO', 'TIPO_DOCUMENTO', 'NUMERO_DOCUMENTO']
    existing_cols = [c for c in cols if c in promo_df.columns]
    
    top_rows = promo_df.sort_values('FECHA', ascending=False)
    for _, row in top_rows[existing_cols].iterrows():
        cp_name = str(row.get('CONTRAPARTIDA_NOMBRE', 'N/A'))
        cp_type = get_cp_category(cp_name, row.get('CONTRAPARTIDA_TIPO', 'N/A'))

        detalle.append({
            "fecha": str(row.get('FECHA', ''))[:10],
            "asiento": str(row.get('ID_ASIENTO', '')),
            "cuenta": str(row.get(acc_col, 'Otros')),
            "detalle": str(row.get('DETALLE', ''))[:100],
            "debe": float(row.get('DEBE', 0)),
            "haber": float(row.get('HABER', 0)),
            "anio": str(int(row.get('ANIO', 0))),
            "contrapartida": cp_name,
            "tipo_cp": cp_type,
            "tipo_doc": str(row.get('TIPO_DOCUMENTO', 'N/A')),
            "num_doc": str(row.get('NUMERO_DOCUMENTO', ''))
        })
        
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
