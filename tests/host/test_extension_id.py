import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def extension_id_from_key(key_b64: str) -> str:
    digest = hashlib.sha256(base64.b64decode(key_b64)).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def test_install_sh_id_matches_manifest_key():
    manifest = json.loads((ROOT / "extension" / "manifest.json").read_text())
    match = re.search(r'^EXTENSION_ID="([a-p]{32})"$', (ROOT / "install.sh").read_text(), re.M)
    assert match, "install.sh must define EXTENSION_ID"
    assert extension_id_from_key(manifest["key"]) == match.group(1)


def test_manifest_permissions_are_minimal():
    manifest = json.loads((ROOT / "extension" / "manifest.json").read_text())
    assert manifest["permissions"] == ["nativeMessaging", "storage"]
    assert "host_permissions" not in manifest
    for script in manifest["content_scripts"]:
        assert script["matches"] == ["https://web.whatsapp.com/*"]


def test_uninstall_model_repo_matches_faster_whisper_mapping():
    import config
    from faster_whisper.utils import _MODELS

    repo = _MODELS[config.MODEL_NAME]
    assert f'MODEL_REPO="{repo}"' in (ROOT / "uninstall.sh").read_text()
