"""ADR-0024 (radio revised 30/10/2026): optional radio streams and the gateway CSP that lets the browser play them."""

import re
from pathlib import Path

from app.comfort import RADIO_HOSTS, radio_streams
from app.config import get_settings
from test_student import env  # noqa: F401  (fixture reuse)

NGINX = Path(__file__).resolve().parents[2] / "gateway" / "nginx.conf"
NIGHTRIDE = "https://stream.nightride.fm/chillsynth.mp3"
PLAZA = "https://radio.plaza.one/mp3"


def test_radio_is_off_by_default_and_only_accepts_https_streams_on_the_allowed_hosts(env, monkeypatch):
    clients, _ = env
    assert clients["a"].get("/api/v1/radio").json() == {"streams": []}
    raw = (f'[{{"label": "Nightride FM — Chillsynth", "url": "{NIGHTRIDE}"}},'
           ' {"label": "En clair", "url": "http://radio.plaza.one/mp3"},'
           ' {"label": "Ailleurs", "url": "https://radio.example.com/stream.mp3"},'
           ' {"label": "YouTube", "url": "https://www.youtube-nocookie.com/embed/abcDEF12345"},'
           ' {"label": "Requête", "url": "https://radio.plaza.one/mp3?autoplay=1"},'
           ' {"label": "Identifiants", "url": "https://user:pw@radio.plaza.one/mp3"},'
           ' {"label": "Port", "url": "https://radio.plaza.one:8443/mp3"},'
           ' {"label": "Sous-domaine", "url": "https://radio.plaza.one.evil.example/mp3"},'
           ' {"label": "<b>x</b>", "url": "https://radio.plaza.one/mp3"},'
           f' {{"label": "Nightwave Plaza", "url": "{PLAZA}"}}]')
    monkeypatch.setattr(get_settings(), "radio_streams", raw)
    streams = clients["a"].get("/api/v1/radio").json()["streams"]
    assert streams == [{"id": "radio-1", "label": "Nightride FM — Chillsynth", "url": NIGHTRIDE},
                       {"id": "radio-2", "label": "Nightwave Plaza", "url": PLAZA}]
    assert radio_streams("pas du json") == [] and radio_streams('{"label": "x"}') == []
    assert clients["teacher"].get("/api/v1/radio").status_code == 200


def test_example_env_lists_the_two_official_streams():
    example = (NGINX.parents[1] / ".env.example").read_text()
    line = next(item for item in example.splitlines() if item.startswith("RADIO_STREAMS="))
    assert [stream["url"] for stream in radio_streams(line.split("=", 1)[1].strip("'"))] == [NIGHTRIDE, PLAZA]


def test_gateway_csp_lets_the_browser_play_exactly_the_radio_hosts():
    policy = re.search(r'add_header Content-Security-Policy "([^"]+)" always;', NGINX.read_text()).group(1)
    directives = {part.split()[0]: part.split()[1:] for part in (item.strip() for item in policy.split(";")) if part}
    assert directives["media-src"] == ["'self'", *(f"https://{host}" for host in RADIO_HOSTS)]
    # The browser reads the streams directly: never through fetch/XHR, never relayed by the gateway.
    assert directives["connect-src"] == ["'self'"]
    proxies = [line for line in NGINX.read_text().splitlines() if "proxy_pass" in line]
    assert proxies and not any(host in line for line in proxies for host in RADIO_HOSTS)
    # Course videos may still be YouTube nocookie or Vimeo embeds (curriculum_schema.VIDEO_HOSTS): frame-src stays.
    assert directives["frame-src"] == ["https://www.youtube-nocookie.com", "https://player.vimeo.com"]
