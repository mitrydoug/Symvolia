FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONPATH=/app/src \
  PORT=8000

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir uv \
  && uv pip sync --system requirements.txt \
  && pip uninstall -y uv

COPY backend/src/ ./src/

# Default mount point for the optional gas-sponsorship SQLite volume. On Railway
# attach a Volume here; the app also creates it on demand if metering is enabled.
RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "symvolia.combined:app", "--host", "0.0.0.0", "--port", "8000"]