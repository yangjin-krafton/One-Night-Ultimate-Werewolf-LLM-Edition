FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    wget \
    curl \
    ffmpeg \
    sox \
    libsox-fmt-all \
    libsndfile1 \
    build-essential \
    cmake \
    pkg-config \
    python3-dev \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Python venv (keep site-packages isolated from system python)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
ENV PIP_ROOT_USER_ACTION=ignore

# PyTorch for CUDA 12.4 (adjust if you use a different CUDA base image)
RUN pip install --no-cache-dir -U pip setuptools wheel \
    && pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# Minimal runtime deps for `api_v2.py` (so you don't lose them when using `docker run --rm ...`)
# If you want the full WebUI stack, install from your repo's `requirements.txt` in a derived image.
RUN pip install --no-cache-dir \
    "numpy<2.0" \
    soundfile \
    "transformers>=4.44,<5" \
    "peft>=0.12" \
    fastapi \
    "uvicorn[standard]"

WORKDIR /workspace
