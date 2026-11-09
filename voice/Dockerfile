FROM python:3.12-slim
RUN pip install --no-cache-dir faster-whisper==1.1.1 fastapi==0.115.6 uvicorn==0.34.0 python-multipart==0.0.20 requests av==13.1.0
WORKDIR /app
COPY app.py .
ENV HF_HOME=/models
EXPOSE 9000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000"]
