#!/usr/bin/env python3
"""构建参考经典宋体排版的中文简历 PDF（2 页 A4），修复文字层部首码点并校验全字符保真。

用法：
  /opt/homebrew/bin/python3.11 resume-src/build_classic.py [--out PATH]
"""
import argparse
import datetime
import pathlib
import re
import subprocess
import sys
import tempfile

from pypdf import PdfReader, PdfWriter

# 复用 build.py 中的 ToUnicode CMap 部首码点修复逻辑
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402
from build import CHROME, LIMIT, fix_text_layer, is_radical, to_unicode_streams  # noqa: E402


def body_zh_chars(html_text: str) -> set[str]:
    """提取 HTML <body> 中所有可见中文汉字集合，用于校验 PDF 文字层保真度。"""
    m = re.search(r"<body[\s\S]*?</body>", html_text, re.I)
    body = m.group(0) if m else html_text
    body = re.sub(r"<style[\s\S]*?</style>|<svg[\s\S]*?</svg>|<[^>]+>", " ", body)
    return set(re.findall(r"[\u4e00-\u9fff]", body))


def fix_songti_kou_bug(writer: PdfWriter, html_chars: set[str]) -> int:
    """macOS Songti SC 将「口」字形误映射到康熙部首 U+2F1C（⼜ 又），导致复制成「又」。
    若正文包含「口」且不包含「又」，在标准 CMap 修复前将 2F1C 纠正为 53E3（口）。
    """
    if "口" not in html_chars or "又" in html_chars:
        return 0
    patched, seen = 0, set()
    for page in writer.pages:
        for stream in to_unicode_streams(page.get("/Resources"), seen):
            raw = stream.get_data().decode("latin1")
            updated = re.sub(r"<2F1C>", "<53E3>", raw, flags=re.I)
            if updated != raw:
                stream.set_data(updated.encode("latin1"))
                patched += 1
    return patched


def print_html(src: pathlib.Path, out: pathlib.Path, profile: pathlib.Path) -> None:
    subprocess.run(
        [
            CHROME,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={out}",
            src.as_uri(),
        ],
        check=True,
        capture_output=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        default=ROOT / "outputs" / "蒲贺良_具身智能算法工程师_简历.pdf",
    )
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)

    src_html = HERE / "resume-classic.html"
    html_chars = body_zh_chars(src_html.read_text(encoding="utf-8"))

    with tempfile.TemporaryDirectory() as tmp:
        raw_pdf = pathlib.Path(tmp) / "raw.pdf"
        print_html(src_html, raw_pdf, pathlib.Path(tmp) / "profile")
        reader = PdfReader(raw_pdf)
        if len(reader.pages) != 2:
            sys.exit(f"resume-classic.html printed {len(reader.pages)} pages; expected exactly 2 A4 pages")

        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        kou_patched = fix_songti_kou_bug(writer, html_chars)
        fixed = fix_text_layer(writer)
        now = datetime.datetime.now().astimezone().strftime("D:%Y%m%d%H%M%S%z")
        writer.add_metadata(
            {
                "/Title": "蒲贺良 - 具身智能算法工程师（VLA / WAM）简历",
                "/Author": "蒲贺良",
                "/ModDate": now[:-2] + "'" + now[-2:] + "'",
            }
        )
        with open(args.out, "wb") as fh:
            writer.write(fh)

    out_reader = PdfReader(args.out)
    extracted = "\n".join(page.extract_text() for page in out_reader.pages)
    size = args.out.stat().st_size
    print(
        f"wrote {args.out} ({size / 1024:.1f} KiB, {len(out_reader.pages)} pages); "
        f"repaired {fixed} ToUnicode maps, patched {kou_patched} Songti-kou map(s)"
    )

    leftover = sorted({ch for ch in extracted if is_radical(ch)})
    if leftover:
        sys.exit("text layer still has radical code points: " + " ".join(leftover))

    pdf_chars = set(re.findall(r"[\u4e00-\u9fff]", extracted))
    missing = sorted(html_chars - pdf_chars)
    extra = sorted(pdf_chars - html_chars)
    if missing or extra:
        sys.exit(f"text layer mismatch vs HTML body: missing={missing}, extra={extra}")

    if size > LIMIT:
        sys.exit("resume PDF is over 3 MiB")


if __name__ == "__main__":
    main()
