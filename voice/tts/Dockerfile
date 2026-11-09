FROM python:3.11-slim
RUN pip install --no-cache-dir piper-tts==1.2.0 fastapi==0.115.6 uvicorn==0.34.0
WORKDIR /app
# Voz neuronal en español (gratis, sin conexión una vez descargada). Alternativa: es_ES-sharvard-medium.
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx /app/voz.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json /app/voz.onnx.json
COPY app.py .
EXPOSE 9100
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9100"]
