# nukesim web app as a container image (see docs/DEPLOY.md).
#
# Build and try it on your own computer:
#   docker build -t nukesim .
#   docker run --rm -p 8000:8000 nukesim        then open http://localhost:8000
#
# Hosting services (Render, Fly.io, ...) set $PORT; the server listens on it.

FROM python:3.12-slim

# uv, the same tool used to run the project locally (copied from its official image)
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH" \
    MPLCONFIGDIR=/tmp/matplotlib \
    PORT=8000 \
    NUKESIM_PROXY_HOPS=1
# NUKESIM_PROXY_HOPS=1: one proxy (the host's load balancer) sits in front of the app, so the
# visitor's address is the last entry it adds to X-Forwarded-For (see src/nukesim/web/protect.py).

WORKDIR /app

# 1) the libraries first (this layer is reused when only our code changes, so rebuilds are quick)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) then our own code
COPY src ./src
RUN uv sync --frozen --no-dev

# run as an ordinary user, not root
RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz', timeout=4)"

# --proxy-headers is off on purpose: the rate limiter reads the visitor's address itself (NUKESIM_PROXY_HOPS).
CMD ["sh", "-c", "exec uvicorn nukesim.web.server:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-proxy-headers --no-server-header --timeout-keep-alive 5"]
