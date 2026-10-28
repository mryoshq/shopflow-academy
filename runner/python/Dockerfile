# Disposable runner for the preconfigured Python snippets of the course (ADR-0017).
# Used only on the Mac by scripts/course_md.py, never by FastAPI, with:
#   --network none --read-only --tmpfs /tmp --user 65534 --cap-drop ALL
#   --security-opt no-new-privileges --memory 256m --cpus 0.5 --pids-limit 64, 20 s max.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MPLCONFIGDIR=/tmp
RUN pip install "pandas==2.2.3" && useradd --uid 10001 --no-create-home runner
USER 10001
WORKDIR /data
CMD ["python", "-I", "-"]
