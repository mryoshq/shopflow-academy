"""Part I (ADR-0024): the optional radio streams."""

from app.comfort import radio_streams
from app.config import get_settings
from test_student import env  # noqa: F401  (fixture reuse)


def test_radio_is_off_by_default_and_only_accepts_youtube_nocookie_embeds(env, monkeypatch):
    clients, _ = env
    assert clients["a"].get("/api/v1/radio").json() == {"streams": []}
    raw = ('[{"label": "Lofi calme", "url": "https://www.youtube-nocookie.com/embed/abcDEF12345"},'
           ' {"label": "Ailleurs", "url": "https://www.youtube.com/embed/abcDEF12345"},'
           ' {"label": "Audio", "url": "https://radio.example.com/stream.mp3"},'
           ' {"label": "<b>x</b>", "url": "https://www.youtube-nocookie.com/embed/abcDEF12345"},'
           ' {"label": "Piège", "url": "https://www.youtube-nocookie.com/embed/abc?autoplay=1&x=\\"onload"}]')
    monkeypatch.setattr(get_settings(), "radio_streams", raw)
    streams = clients["a"].get("/api/v1/radio").json()["streams"]
    assert streams == [{"id": "abcDEF12345", "label": "Lofi calme", "url": "https://www.youtube-nocookie.com/embed/abcDEF12345"}]
    assert radio_streams("pas du json") == [] and radio_streams('{"label": "x"}') == []
    assert clients["teacher"].get("/api/v1/radio").status_code == 200
