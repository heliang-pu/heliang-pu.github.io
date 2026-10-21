#!/usr/bin/env python3
"""Rebuild heliang-pu-resume.pdf.

Page 1 is page1.pdf, drawn exactly as it is. Page 2 is page2.html printed by headless Chrome.
The text layer of both pages is repaired so copy-paste and keyword search find words like 工程师.

usage: python3 resume-src/build.py [--out PATH]
Needs Google Chrome and pypdf (python3 -m pip install pypdf; on this Mac /opt/homebrew/bin/python3.11 has it).
"""
import argparse
import datetime
import pathlib
import re
import subprocess
import sys
import tempfile
import unicodedata

from pypdf import PdfReader, PdfWriter
from pypdf.generic import IndirectObject, NameObject

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LIMIT = 3 * 1024 * 1024  # tests/site-contract.test.mjs: resume PDF is at most 3 MiB

# PingFang draws 大, 工, 长 … with glyphs it also maps to radical code points, and Skia's ToUnicode
# picks the radical, so the PDF text says ⼤⼯⻓ and search for 工程师 or 人形 fails.
# Kangxi radicals and compatibility ideographs have NFKC forms; the simplified radicals below do not,
# so they follow Unicode's EquivalentUnifiedIdeograph.txt.
RADICAL_SUPPLEMENT = {
    0x2EA0: 0x6C11,  # ⺠ 民
    0x2EC5: 0x89C1,  # ⻅ 见
    0x2EC9: 0x8D1D,  # ⻉ 贝
    0x2ECB: 0x8F66,  # ⻋ 车
    0x2ED3: 0x957F,  # ⻓ 长
    0x2ED4: 0x95E8,  # ⻔ 门
    0x2EDA: 0x9875,  # ⻚ 页
    0x2EDB: 0x98CE,  # ⻛ 风
    0x2EDC: 0x98DE,  # ⻜ 飞
    0x2EE2: 0x9A6C,  # ⻢ 马
    0x2EE3: 0x9AA8,  # ⻣ 骨
    0x2EE5: 0x9C7C,  # ⻥ 鱼
    0x2EE6: 0x9E1F,  # ⻦ 鸟
    0x2EEC: 0x9F50,  # ⻬ 齐
    0x2EEE: 0x9F7F,  # ⻮ 齿
    0x2EF0: 0x9F99,  # ⻰ 龙
    0x2EF3: 0x9F9F,  # ⻳ 龟
}


def is_radical(ch: str) -> bool:
    return 0x2E80 <= ord(ch) <= 0x2FDF or 0xF900 <= ord(ch) <= 0xFAFF


def plain_ideograph(ch: str) -> str:
    if 0x2F00 <= ord(ch) <= 0x2FDF or 0xF900 <= ord(ch) <= 0xFAFF:
        return unicodedata.normalize("NFKC", ch)
    return chr(RADICAL_SUPPLEMENT.get(ord(ch), ord(ch)))


def fix_cmap(cmap: str) -> str | None:
    """Return the ToUnicode CMap with radical targets replaced, or None if nothing needs fixing."""
    pairs = []
    for block in re.findall(r"beginbfchar(.*?)endbfchar", cmap, re.S):
        pairs += re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", block)
    for block in re.findall(r"beginbfrange(.*?)endbfrange", cmap, re.S):
        ranges = re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])", block)
        for lo, hi, dst, array in ranges:
            start, count = int(lo, 16), int(hi, 16) - int(lo, 16) + 1
            if array:
                targets = re.findall(r"<([0-9A-Fa-f]*)>", array)
            else:  # one destination: its last byte counts up with the source code
                base = bytes.fromhex(dst)
                targets = [(base[:-1] + bytes([base[-1] + i])).hex() for i in range(count)]
            pairs += [(f"{start + i:0{len(lo)}X}", target) for i, target in enumerate(targets)]

    fixed, changed = [], False
    for src, dst in pairs:
        text = bytes.fromhex(dst).decode("utf-16-be", "surrogatepass")
        plain = "".join(plain_ideograph(ch) for ch in text)
        changed |= plain != text
        fixed.append((src.upper(), plain.encode("utf-16-be", "surrogatepass").hex().upper()))
    if not changed:
        return None

    head = cmap[: cmap.index("endcodespacerange") + len("endcodespacerange")]
    blocks = [
        f"{len(chunk)} beginbfchar\n" + "".join(f"<{s}> <{d}>\n" for s, d in chunk) + "endbfchar"
        for chunk in (fixed[i : i + 100] for i in range(0, len(fixed), 100))
    ]
    return head + "\n" + "\n".join(blocks) + "\n" + cmap[cmap.index("endcmap") :]


def entries(resources, kind: str):
    return resources[kind].values() if kind in resources else []


def to_unicode_streams(resources, seen: set):
    """Yield each ToUnicode stream reachable from a resources dict, including form XObjects and patterns."""
    if resources is None or id(resources.get_object()) in seen:
        return
    resources = resources.get_object()
    seen.add(id(resources))
    for font in entries(resources, "/Font"):
        font = font.get_object()
        stream = font.get("/ToUnicode")
        key = (stream.idnum, stream.generation) if isinstance(stream, IndirectObject) else id(stream)
        if stream is not None and key not in seen:
            seen.add(key)
            yield stream.get_object()
        yield from to_unicode_streams(font.get("/Resources"), seen)
    for kind in ("/XObject", "/Pattern"):
        for obj in entries(resources, kind):
            yield from to_unicode_streams(obj.get_object().get("/Resources"), seen)


def fix_text_layer(writer: PdfWriter) -> int:
    fixed, seen = 0, set()
    for page in writer.pages:
        for stream in to_unicode_streams(page.get("/Resources"), seen):
            cmap = fix_cmap(stream.get_data().decode("latin1"))
            if cmap is not None:
                stream.set_data(cmap.encode("latin1"))
                fixed += 1
    return fixed


def print_page2(out: pathlib.Path, profile: pathlib.Path) -> None:
    subprocess.run(
        [
            CHROME,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={out}",
            (HERE / "page2.html").as_uri(),
        ],
        check=True,
        capture_output=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=pathlib.Path, default=ROOT / "heliang-pu-resume.pdf")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        page2_pdf = pathlib.Path(tmp) / "page2.pdf"
        print_page2(page2_pdf, pathlib.Path(tmp) / "profile")
        page1 = PdfReader(HERE / "page1.pdf")
        page2 = PdfReader(page2_pdf)
        if len(page2.pages) != 1:
            sys.exit(f"page2.html printed {len(page2.pages)} pages; it must fit on one A4 page")

        writer = PdfWriter()
        writer.add_page(page1.pages[0])
        writer.add_page(page2.pages[0])
        fixed = fix_text_layer(writer)
        for key in ("/Lang", "/ViewerPreferences"):
            if key in page2.trailer["/Root"]:
                writer._root_object[NameObject(key)] = page2.trailer["/Root"][key]
        now = datetime.datetime.now().astimezone().strftime("D:%Y%m%d%H%M%S%z")
        writer.add_metadata({**page1.metadata, "/ModDate": now[:-2] + "'" + now[-2:] + "'"})
        with open(args.out, "wb") as fh:
            writer.write(fh)

    size = args.out.stat().st_size
    print(f"wrote {args.out} ({size / 1024 / 1024:.2f} MiB); repaired {fixed} ToUnicode maps")
    leftover = sorted({ch for page in PdfReader(args.out).pages for ch in page.extract_text() if is_radical(ch)})
    if leftover:
        print("warning: text layer still has radical code points; extend RADICAL_SUPPLEMENT: " + " ".join(leftover))
    if size > LIMIT:
        sys.exit("resume PDF is over 3 MiB")


if __name__ == "__main__":
    main()
