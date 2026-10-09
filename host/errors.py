"""The one error type the host turns into an error reply."""


class HostError(Exception):
    """An expected failure with a stable code that the extension maps to a caption text."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
