import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def media_folder(tmp_path, monkeypatch):
    """Course videos copied at import go to a temporary folder, never /srv/media."""
    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path / "media"))
