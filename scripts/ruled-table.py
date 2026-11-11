"""Tablas con rejilla (Código | Marca | Descripción | T.RAEE | Cantidad | Precio | Dto | Dto | Importe).

Es el formato de las ofertas y albaranes de Suministros INRA (Grupo Unase) y otros distribuidores del grupo:
las reglas verticales separan las columnas, así que cada celda se lee por separado (OCR por celda) en vez de
dejar que el OCR mezcle texto y bordes. Entrada: imagen ya derecha. Salida: JSON con cabecera y filas.
No inventa nada: una fila solo se da por buena si cantidad × precio × (1 − dtos) = importe, o si una sola
celda se deduce de las otras cuatro y se parece a lo que el OCR leyó (entonces va marcada como reparada).
"""
import sys
import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal, ROUND_HALF_UP
import cv2
import numpy as np

cv2.setNumThreads(1)
TESS = os.environ.get('TESSERACT_PATH', 'tesseract')
COLUMNS = ['code', 'brand', 'description', 'raee', 'quantity', 'price', 'dto1', 'dto2', 'total']
DECIMALS = {'raee': 2, 'quantity': 2, 'price': 3, 'dto1': 2, 'dto2': 2, 'total': 2}
NUMERIC = list(DECIMALS)
STEP = 16


def tess(gray, psm='7', whitelist=None, lang='eng', scale=4):
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, 'c.png')
        big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        big = cv2.copyMakeBorder(big, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        cv2.imwrite(path, big)
        args = [TESS, path, 'stdout', '-l', lang, '--psm', psm]
        if whitelist:
            args += ['-c', 'tessedit_char_whitelist=' + whitelist]
        out = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60, env={**os.environ, 'OMP_THREAD_LIMIT': '1'}).stdout or ''
    return ' '.join(out.split())


def tess_conf(gray, whitelist=None, lang='eng', scale=4):
    """Texto de una celda y confianza media (0-100) de Tesseract."""
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, 'c.png')
        big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        big = cv2.copyMakeBorder(big, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        cv2.imwrite(path, big)
        args = [TESS, path, 'stdout', '-l', lang, '--psm', '7']
        if whitelist:
            args += ['-c', 'tessedit_char_whitelist=' + whitelist]
        out = subprocess.run(args + ['tsv'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60, env={**os.environ, 'OMP_THREAD_LIMIT': '1'}).stdout or ''
    words, total, weight = [], 0.0, 0
    for line in out.splitlines()[1:]:
        c = line.split('	')
        if len(c) >= 12 and c[0] == '5' and c[11].strip():
            words.append(c[11].strip())
            total += float(c[10]) * len(c[11])
            weight += len(c[11])
    return ' '.join(words), (total / weight if weight else 0.0)


def best_read(crop, whitelist=None, lang='eng', fast=False):
    """La lectura de más confianza en gris y en blanco/negro (solo en gris si hay muchas filas)."""
    best = ('', 0.0)
    for variant in ((crop,) if fast else (crop, cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1])):
        text, conf = tess_conf(variant, whitelist, lang, 4)
        if text and conf > best[1]:
            best = (text, conf)
    return best


def slice_minima(gray, y0, y1):
    """Reglas verticales candidatas en una franja horizontal: valles estrechos y oscuros."""
    band = gray[y0:y1, :].astype(np.float32).mean(0)
    smooth = cv2.GaussianBlur(band.reshape(1, -1), (0, 0), 1.0).ravel()
    local = cv2.GaussianBlur(band.reshape(1, -1), (0, 0), 14).ravel()
    depth = local - smooth
    return [x for x in range(2, len(depth) - 2) if depth[x] > 16 and depth[x] >= depth[x - 1] and depth[x] > depth[x + 1]]


def find_tracks(gray):
    """Sigue cada regla vertical de arriba abajo (la foto es de lado y las reglas se abren en abanico) y la ajusta a una recta x = a + b·y."""
    global STEP
    h, w = gray.shape
    STEP = max(8, h // 100)
    step, size = STEP, int(STEP * 1.75)
    ys = list(range(0, h - size, step))
    minima = {y: slice_minima(gray, y, y + size) for y in ys}
    tracks = []  # cada uno: lista de (y, x)
    for y in ys:
        for x in minima[y]:
            best = None
            for t in tracks:
                ty, tx = t[-1]
                if y - ty > step * 4:
                    continue
                slope = (t[-1][1] - t[-3][1]) / max(1, t[-1][0] - t[-3][0]) if len(t) >= 3 else 0
                dist = abs(tx + slope * (y - ty) - x)
                if dist <= 5 and (best is None or dist < best[0]):
                    best = (dist, t)
            if best:
                best[1].append((y, x))
            else:
                tracks.append([(y, x)])
    out = []
    for t in tracks:
        if len(t) < 14:
            continue
        pts = np.array(t, dtype=np.float32)
        slope, intercept = np.polyfit(pts[:, 0], pts[:, 1], 1)
        keep = np.abs(pts[:, 1] - (slope * pts[:, 0] + intercept)) < 4
        if keep.sum() < 14 or abs(slope) > .12:
            continue
        slope, intercept = np.polyfit(pts[keep, 0], pts[keep, 1], 1)
        out.append({'a': float(intercept), 'b': float(slope), 'top': int(pts[keep, 0].min()), 'bottom': int(pts[keep, 0].max() + size), 'n': int(keep.sum())})
    return out


def table_rules(tracks, h):
    """Las 10 reglas más largas (la rejilla de la tabla), de izquierda a derecha. Menos de 10 largas: no es esta tabla."""
    floor = .3 * (h / STEP)
    long_ones = sorted((t for t in tracks if t['n'] >= floor), key=lambda t: -t['n'])[:10]
    if len(long_ones) < 10:
        return []
    mid = h * .6
    return sorted(long_ones, key=lambda t: t['a'] + t['b'] * mid)


def x_at(rule, y):
    return rule['a'] + rule['b'] * y


def text_bands(ink, rules, y0, y1, first, last):
    """Filas de texto entre las reglas `first` y `last` (índices), sin contar las propias reglas (que van inclinadas)."""
    h, w = ink.shape
    work = ink.copy()
    mask = np.zeros_like(ink)
    for r in rules:
        cv2.line(mask, (int(x_at(r, 0)), 0), (int(x_at(r, h)), h), 255, 11)
    work[mask > 0] = 0
    x0 = int(min(x_at(rules[first], y0), x_at(rules[first], y1))) + 6
    x1 = int(max(x_at(rules[last], y0), x_at(rules[last], y1))) - 6
    profile = (work[y0:y1, x0:x1] > 0).sum(1)
    threshold = max(2, int((x1 - x0) * .012))
    bands, start = [], None
    for i, v in enumerate(profile):
        if v >= threshold and start is None:
            start = i
        elif v < threshold and start is not None:
            bands.append([start, i])
            start = None
    if start is not None:
        bands.append([start, len(profile)])
    return [(y0 + a, y0 + b) for a, b in bands if b - a >= 6]


def to_number(raw, decimals):
    """Número impreso con decimales fijos por columna. Con coma o punto visibles se respetan (y se rellenan los ceros finales que el OCR suele perder: «35,85» → 35,850); sin separador se asume la coma perdida."""
    text = (raw or '').strip()
    if not re.search(r'\d', text):
        return None
    text = re.sub(r'[^\d.,]', '', text)
    m = re.match(r'^(\d*)[.,](\d*)$', text)
    if m and (m.group(1) or m.group(2)):
        whole, frac = m.group(1) or '0', m.group(2)
        if len(frac) <= decimals:
            return Decimal(whole + '.' + frac.ljust(decimals, '0'))
        text = whole + frac  # demasiados decimales: se reinterpreta por el formato
    digits = re.sub(r'\D', '', text).lstrip('0') or '0'
    digits = digits.rjust(decimals + 1, '0')
    return Decimal(digits[:-decimals] + '.' + digits[-decimals:])


def cents(d):
    return d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def reconciles(q, price, d1, d2, total):
    value = q * price * (1 - d1 / 100) * (1 - d2 / 100)
    return cents(value) == total


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def digits_of(v):
    return re.sub(r'\D', '', str(v)).lstrip('0')


def repair(v):
    """Si una sola celda no cuadra, se deduce de las otras cuatro y se acepta solo si se parece a lo que el OCR leyó."""
    q, p, d1, d2, t = v['quantity'], v['price'], v['dto1'], v['dto2'], v['total']
    if None in (q, p, d1, d2, t):
        return None
    f1, f2 = 1 - d1 / 100, 1 - d2 / 100
    options = [('total', cents(q * p * f1 * f2))]
    if q > 0 and f1 * f2 > 0:
        mid = t / (q * f1 * f2)  # varios precios de 3 decimales dan el mismo importe: se elige el más parecido a lo leído
        options += [('price', (mid + Decimal(k) / 1000).quantize(Decimal('0.001'))) for k in (-2, -1, 0, 1, 2)]
    if q * p * f2 > 0:
        options.append(('dto1', ((1 - t / (q * p * f2)) * 100 * 2).quantize(Decimal('1')) / 2))
    if q * p * f1 > 0:
        options.append(('dto2', ((1 - t / (q * p * f1)) * 100 * 2).quantize(Decimal('1')) / 2))
    if p * f1 * f2 > 0:
        options.append(('quantity', (t / (p * f1 * f2) * 2).quantize(Decimal('1')) / 2))
    best = None
    for key, value in options:
        if value < 0:
            continue
        cand = dict(v)
        cand[key] = value
        if not reconciles(cand['quantity'], cand['price'], cand['dto1'], cand['dto2'], cand['total']):
            continue
        distance = lev(digits_of(v[key]), digits_of(value))
        if distance <= 2 and (best is None or distance < best[0]):
            best = (distance, cand, key)
    return best


def clean_gray(gray, rules, width=9):
    """Copia sin las reglas de la tabla: un borde pegado a una cifra se lee como un «1»."""
    h = gray.shape[0]
    mask = np.zeros_like(gray)
    for r in rules:
        cv2.line(mask, (int(x_at(r, 0)), 0), (int(x_at(r, h)), h), 255, width)
    out = gray.copy()
    out[mask > 0] = int(np.percentile(gray, 85))
    return out


def ink_crop(crop):
    """Recorta al tinte (sin el margen blanco): el OCR lee mejor números ajustados."""
    _, bw = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ys, xs = np.where(bw > 0)
    if len(xs) < 8:
        return crop
    return crop[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3]


def reads(crop, column, fast=False):
    """Lecturas de la misma celda: en gris y en blanco/negro (solo en gris si hay muchas filas). Cada lectura es un proceso de Tesseract."""
    out = []
    for variant in ((crop,) if fast else (crop, cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1])):
        if column in NUMERIC:
            out.append(tess(ink_crop(variant), '7', '0123456789.,', 'eng', 5))
        elif column == 'code':
            out.append(tess(variant, '7', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._/', 'eng', 4))
        else:
            out.append(tess(variant, '7', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. ', 'eng', 4))
    return [r for r in out if r]


def vote(got):
    return max(got, key=lambda r: (got.count(r), len(r))) if got else ''


def read_cell(gray, box, column, fast=False):
    x0, y0, x1, y1 = [int(v) for v in box]
    crop = gray[max(0, y0 - 2):y1 + 3, max(0, x0 + 6):max(x0 + 7, x1 - 4)]
    if crop.size == 0:
        return ''
    if column == 'brand':
        return vote(reads(crop, column, fast))
    if column == 'code':
        got = reads(crop, column)
        good = [r for r in got if re.match(r'^[A-Z0-9][A-Z0-9._/-]{3,14}$', r) and re.search(r'\d', r)]
        return vote(good or got)
    return best_read(crop, None, 'spa+eng', fast)[0]


NICE_DISCOUNTS = [Decimal(x) for x in range(0, 71, 5)]


def candidates(raws, column):
    """Valores posibles de una celda numérica. Los descuentos (múltiplos de 0,5) y las cantidades (múltiplos de 0,5) solo admiten valores redondos: un 60,01 es ruido de borde."""
    weight = {}

    def add(value, w):
        if value is not None and value >= 0:
            weight[value] = weight.get(value, 0) + w

    def snap(v, tolerance):
        near = (v * 2).quantize(Decimal('1')) / 2
        return near if abs(near - v) <= tolerance else None

    for raw in raws:
        v = to_number(raw, DECIMALS[column])
        if v is None:
            continue
        if column in ('dto1', 'dto2'):
            add(snap(v, Decimal('0.3')), 1.0)
            near = min(NICE_DISCOUNTS, key=lambda d: abs(d - v))
            if abs(near - v) <= 5:
                add(near, .4)
        elif column == 'raee':
            add(Decimal('0.00'), 1.0)
        elif column == 'quantity':
            add(snap(v, Decimal('0.06')), 1.0)
        else:
            add(v, 1.0)
            if column == 'price':
                add(v.quantize(Decimal('0.01')).quantize(Decimal('0.001')), .3)  # una cifra de más pegada al borde
    return sorted(weight.items(), key=lambda kv: -kv[1])[:6]


def row_options(cands, limit=6):
    """Combinaciones cantidad × precio × (1−dto1) × (1−dto2) = importe, de mayor a menor peso."""
    found = []
    for q, wq in cands['quantity']:
        for p, wp in cands['price']:
            for d1, w1 in cands['dto1']:
                for d2, w2 in cands['dto2']:
                    for t, wt in cands['total']:
                        if reconciles(q, p, d1, d2, t):
                            found.append((wq + wp + w1 + w2 + wt, {'quantity': q, 'price': p, 'dto1': d1, 'dto2': d2, 'total': t}))
    found.sort(key=lambda x: -x[0])
    return found[:limit]


def read_row(gray, thin, band, rules, fast=False):
    """Lee una fila (celda a celda). Devuelve celdas, valores elegidos, cómo se validó ('ok', 'repaired:<celda>' o '') y alternativas."""
    yc = (band[0] + band[1]) / 2
    edges = [x_at(r, yc) for r in rules]
    boxes = {c: (edges[i], band[0], edges[i + 1], band[1]) for i, c in enumerate(COLUMNS)}
    cells, raws = {}, {}
    for c in COLUMNS:
        if c in NUMERIC:
            x0, y0, x1, y1 = [int(v) for v in boxes[c]]
            crop = gray[max(0, y0 - 2):y1 + 3, max(0, x0 + 6):max(x0 + 7, x1 - 4)]
            # la tasa RAEE casi siempre es 0,00 y no entra en la cuenta: una sola lectura; con muchas filas, lecturas rápidas
            raws[c] = (reads(crop, c, fast or c in ('raee', 'dto2'))) if crop.size else []
            cells[c] = vote(raws[c])
        elif c == 'code':
            # el código empieza pegado a la regla: máscara fina y sin recortar su primera cifra
            x0, y0, x1, y1 = [int(v) for v in boxes[c]]
            crop = thin[max(0, y0 - 2):y1 + 3, max(0, x0 + 3):max(x0 + 4, x1 - 3)]
            text, conf = best_read(crop, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._/', 'eng', fast) if crop.size else ('', 0.0)
            text = text.replace(' ', '')
            cells[c] = text if conf >= 70 and re.match(r'^[A-Z0-9][A-Z0-9._/-]{3,14}$', text) and re.search(r'\d', text) else ''
        else:
            cells[c] = read_cell(gray, boxes[c], c, fast)
    cands = {c: candidates(raws[c], c) for c in NUMERIC}
    options = row_options(cands) if all(cands[c] for c in ('quantity', 'price', 'dto1', 'dto2', 'total')) else []
    values = {c: (cands[c][0][0] if cands[c] else None) for c in NUMERIC}
    how = ''
    if options:
        top = {c: cands[c][0][0] for c in cands if cands[c]}
        values.update(options[0][1])
        how = 'ok' if all(values[c] == top.get(c) for c in ('quantity', 'price', 'dto1', 'dto2', 'total')) else 'repaired:lectura'
    elif all(values[c] is not None for c in ('quantity', 'price', 'dto1', 'dto2', 'total')):
        fixed = repair(values)
        if fixed:
            values, how = fixed[1], 'repaired:' + fixed[2]
            options = [(0, fixed[1])]
    alts = [{k: str(v) for k, v in o[1].items()} for o in options]
    return cells, values, how, alts


def main():
    image = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE)
    if image is None:
        print(json.dumps({'found': False, 'reason': 'imagen'}))
        return
    h, w = image.shape
    rules = table_rules(find_tracks(image), h)
    if len(rules) != 10:
        print(json.dumps({'found': False, 'reason': f'reglas={len(rules)}'}))
        return
    top = int(np.median([r['top'] for r in rules]))
    bottom = int(min(r['bottom'] for r in rules))
    ink = cv2.adaptiveThreshold(image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 41, 12)
    clean = clean_gray(image, rules)
    thin = clean_gray(image, rules, 5)
    num_bands = [b for b in text_bands(ink, rules, top, bottom, 3, 9) if b[0] > top + h * .012]  # sin la cabecera
    desc_bands = text_bands(ink, rules, top, bottom, 2, 3)
    rows, notes = [], []
    fast = len(num_bands) > 14
    # Las filas son independientes: se leen a la vez (cada lectura es un proceso de Tesseract).
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda band: read_row(clean, thin, band, rules, fast), num_bands))
    for band, (cells, values, how, alts) in zip(num_bands, results):
        if sum(1 for c in NUMERIC if re.search(r'\d', cells[c] or '')) < 3 or re.search(r'rogamos|importante|portes|oferta por si', cells['description'], re.I):
            continue
        if values.get('quantity') is None or values['quantity'] <= 0:
            continue
        rows.append({'cells': cells, 'how': how, 'values': {k: (str(v) if v is not None else None) for k, v in values.items()}, 'band': list(band), 'extra': [], 'alternatives': alts})
    # Texto de descripción sin números: entre dos filas completa la descripción; tras la última fila es una nota del proveedor.
    for band in desc_bands:
        yc = (band[0] + band[1]) / 2
        if band[0] <= top + h * .012 or any(r['band'][0] - 3 <= yc <= r['band'][1] + 3 for r in rows):
            continue
        text = read_cell(clean, (x_at(rules[2], yc), band[0], x_at(rules[3], yc), band[1]), 'description')
        if not text.strip():
            continue
        before = [r for r in rows if r['band'][1] <= yc]
        after = [r for r in rows if r['band'][0] >= yc]
        if before and after:
            before[-1]['extra'].append(text)
        else:
            notes.append(text)
    identity = ''
    if top > 40:
        identity = tess(image[top - 34:top - 1, max(0, int(x_at(rules[0], top)) - 12):int(x_at(rules[-1], top))], '7', '0123456789/ ', 'eng', 4)
    print(json.dumps({'found': True, 'identity': identity, 'rows': rows, 'notes': notes, 'top': top, 'bottom': bottom}, ensure_ascii=False))


if __name__ == '__main__':
    main()
