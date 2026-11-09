import pytest


@pytest.fixture(autouse=True)
def _own_web_home(tmp_path, monkeypatch):
    """The workbench's database and credentials live in the test's own directory."""
    monkeypatch.setenv("TRADINGAGENTS_WEB_HOME", str(tmp_path / "web"))
