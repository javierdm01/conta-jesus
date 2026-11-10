FROM python:3.11-slim
RUN pip install --no-cache-dir piper-tts==1.2.0 fastapi==0.115.6 uvicorn==0.34.0 kokoro-onnx
WORKDIR /app
# Kokoro: voz mucho más natural que Piper, local y gratis (Apache 2.0, ~340 MB, corre en CPU).
ADD https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx /app/kokoro.onnx
ADD https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin /app/kokoro-voices.bin
# Voces neuronales en español (gratis y sin conexión una vez descargadas). Se elige una desde el asistente.
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx /app/davefx.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json /app/davefx.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx /app/sharvard.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json /app/sharvard.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx /app/claude.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json /app/claude.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx /app/ald.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json /app/ald.onnx.json
COPY app.py .
EXPOSE 9100
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9100"]
