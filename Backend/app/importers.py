import html as html_lib
import io
import re

import mammoth
import markdown
import nh3


class ImportFailed(Exception):
    """Raised with a user-friendly message when a file can't be converted."""


# Only tags the editor (TipTap) understands. Everything else is stripped.
ALLOWED_TAGS = {
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "hr",
    "a",
}
ALLOWED_ATTRIBUTES = {"a": {"href"}}


def sanitize(html: str) -> str:
    return nh3.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES)


def _decode_text(data: bytes) -> str:
    if b"\x00" in data:
        raise ImportFailed("This doesn't look like a plain text file.")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Common for files saved by older Windows editors
        return data.decode("cp1252", errors="replace")


def _txt_to_html(data: bytes) -> str:
    text = _decode_text(data).replace("\r\n", "\n").replace("\r", "\n").strip()
    paragraphs = re.split(r"\n\s*\n", text)
    parts = []
    for p in paragraphs:
        if p.strip():
            parts.append(
                "<p>" + html_lib.escape(p.strip("\n")).replace("\n", "<br>") + "</p>"
            )
    return "".join(parts)


def _md_to_html(data: bytes) -> str:
    return markdown.markdown(
        _decode_text(data), extensions=["fenced_code", "sane_lists"]
    )


def _docx_to_html(data: bytes) -> str:
    try:
        # "u => u" keeps underlined text (mammoth drops it by default)
        result = mammoth.convert_to_html(io.BytesIO(data), style_map="u => u")
    except Exception as exc:
        raise ImportFailed(
            "Could not read this .docx file. It may be corrupted or password-protected."
        ) from exc
    return result.value


CONVERTERS = {
    ".txt": _txt_to_html,
    ".md": _md_to_html,
    ".docx": _docx_to_html,
}
SUPPORTED_EXTENSIONS = set(CONVERTERS)


def convert_to_html(extension: str, data: bytes) -> str:
    html = sanitize(CONVERTERS[extension](data))
    if not re.sub(r"<[^>]+>", "", html).strip():
        raise ImportFailed("No readable text was found in this file.")
    return html
