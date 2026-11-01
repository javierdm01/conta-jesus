"""Variantes OCR locales: foto, trama de pantalla y blanco/negro. Original inmutable."""
import sys
import json
from pathlib import Path
import cv2
import numpy as np
cv2.setNumThreads(1)


def screen_score(image):
    height, width = image.shape
    size = min(512, height, width)
    if size < 128:
        return 0
    ratios = []
    window = cv2.createHanningWindow((size, size), cv2.CV_32F)
    yy, xx = np.ogrid[-size//2:size-size//2, -size//2:size-size//2]
    distance = np.sqrt(xx**2 + yy**2) / size
    for xf, yf in [(.25, .35), (.65, .35), (.25, .6), (.65, .6)]:
        x, y = min(width-size, int(width*xf)), min(height-size, int(height*yf))
        patch = image[y:y+size, x:x+size].astype('float32')
        patch -= cv2.GaussianBlur(patch, (0, 0), 4)
        spectrum = np.abs(np.fft.fftshift(np.fft.fft2(patch*window)))
        values = spectrum[(distance > .12) & (distance < .45)]
        ratios.append(float(values.max() / max(1, np.median(values))))
    return sorted(ratios)[1]


def page_on_dark_background(image):
    mask = cv2.threshold(image, 100, 255, cv2.THRESH_BINARY)[1]
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((17, 17), 'uint8'))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image
    contour = max(contours, key=cv2.contourArea)
    points = cv2.approxPolyDP(contour, .02*cv2.arcLength(contour, True), True)
    if len(points) != 4 or not .5*image.size < cv2.contourArea(contour) < .985*image.size:
        return image
    points = points[:, 0].astype('float32')
    sums, differences = points.sum(1), np.diff(points, axis=1)[:, 0]
    corners = np.array([points[np.argmin(sums)], points[np.argmin(differences)],
                        points[np.argmax(sums)], points[np.argmax(differences)]])
    width = int(max(np.linalg.norm(corners[0]-corners[1]), np.linalg.norm(corners[2]-corners[3])))
    height = int(max(np.linalg.norm(corners[0]-corners[3]), np.linalg.norm(corners[1]-corners[2])))
    matrix = cv2.getPerspectiveTransform(corners, np.float32([[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]]))
    return cv2.warpPerspective(image, matrix, (width, height), borderValue=255)


def prepare_photo(image, destination):
    height, width = image.shape
    binary = cv2.adaptiveThreshold(image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 41, 15)
    lines = cv2.HoughLinesP(binary, 1, np.pi / 1800, threshold=max(80, width // 20),
                            minLineLength=width * .18, maxLineGap=8)
    mask = np.zeros_like(binary)
    angles = []
    thickness = max(5, round(width * .0025))
    if lines is not None:
        for x1, y1, x2, y2 in lines[:, 0]:
            dx, dy = x2 - x1, y2 - y1
            horizontal = abs(dy) < abs(dx) * .09
            vertical = abs(dx) < abs(dy) * .09
            if not (horizontal or vertical):
                continue
            if horizontal:
                angles.append(np.degrees(np.arctan(dy / dx)))
            # No borrar bandas gruesas de cabecera con letras blancas.
            mx, my = (x1 + x2) // 2, (y1 + y2) // 2
            radius = thickness * 2
            strip = (binary[max(0, my-radius):my+radius+1, mx] if horizontal
                     else binary[my, max(0, mx-radius):mx+radius+1])
            if np.mean(strip > 0) > .8:
                continue
            cv2.line(mask, (x1, y1), (x2, y2), 255, thickness)
    background = cv2.GaussianBlur(image, (0, 0), 25)
    output = cv2.divide(image, background, scale=255)
    output = cv2.inpaint(output, mask, 5, cv2.INPAINT_TELEA)
    if angles:
        angle = float(np.median(angles))
        if abs(angle) > .1:
            matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1)
            output = cv2.warpAffine(output, matrix, (width, height), borderValue=255)
    if not cv2.imwrite(destination, output):
        raise ValueError("No se pudo guardar la preparación OCR")


def main():
    source, destination = sys.argv[1:3]
    image = cv2.imread(source, cv2.IMREAD_GRAYSCALE)
    if image is None or image.size > 40_000_000:
        raise ValueError("Imagen OCR no válida o demasiado grande")
    score = screen_score(image)
    # Papel fotografiado y JPEG también producen picos periódicos moderados.
    # Reservar el desenfoque fuerte para la trama intensa de una pantalla.
    screen = score > 280
    rectified_page = False
    if screen:
        # El suavizado se aplica antes de enderezar/remuestrear para eliminar la trama original.
        smoothed = cv2.GaussianBlur(image, (0, 0), 2)
        smoothed = page_on_dark_background(smoothed)
        background = cv2.GaussianBlur(smoothed, (0, 0), 20)
        output = cv2.divide(smoothed, background, scale=255)
        cv2.imwrite(destination, output)
    else:
        rectified = page_on_dark_background(image)
        rectified_page = rectified.shape != image.shape
        prepare_photo(rectified, destination)
        output = cv2.imread(destination, cv2.IMREAD_GRAYSCALE)
    binary_path = str(Path(destination).with_name(Path(destination).stem+'-binary.png'))
    binary = cv2.adaptiveThreshold(output, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 41, 15)
    cv2.imwrite(binary_path, binary)
    variants = [destination, binary_path]
    if rectified_page:
        variants.append(destination)
        raw_page = str(Path(destination).with_name(Path(destination).stem+'-page.png'))
        cv2.imwrite(raw_page, rectified)
        variants.append(raw_page)
    print(json.dumps({'screen': screen, 'screenScore': round(score, 2),
                      'variants': variants}))


if __name__ == '__main__':
    main()
