import config


def test_cpu_threads_is_at_least_one():
    assert config.CPU_THREADS >= 1


def test_no_language_setting_is_read_from_files():
    # The extension's popup is the only place to choose languages; they come with each request.
    for name in ("CONFIG_DIR", "LANGUAGES_FILE", "load_allowed_languages", "ALLOWED_LANGUAGES"):
        assert not hasattr(config, name)
