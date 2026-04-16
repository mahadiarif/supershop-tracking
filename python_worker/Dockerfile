FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libglib2.0-0 \
    libgl1 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY python_worker/requirements.txt /app/python_worker/requirements.txt
RUN pip install --no-cache-dir -r /app/python_worker/requirements.txt

COPY . /app

CMD ["python", "python_worker/main.py"]
