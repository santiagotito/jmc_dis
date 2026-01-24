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
