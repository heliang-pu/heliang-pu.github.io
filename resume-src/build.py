#!/usr/bin/env python3
"""Rebuild heliang-pu-resume.pdf.

Page 1 is page1.pdf, kept exactly as it is. Page 2 is page2.html printed by headless Chrome.

usage: python3 resume-src/build.py [--out PATH]
Needs Google Chrome and pypdf (python3 -m pip install pypdf; on this Mac /opt/homebrew/bin/python3.11 has it).
"""
import argparse
import datetime
import pathlib
import subprocess
import sys
import tempfile

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LIMIT = 3 * 1024 * 1024  # tests/site-contract.test.mjs: resume PDF is at most 3 MiB


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
        for key in ("/Lang", "/ViewerPreferences"):
            if key in page2.trailer["/Root"]:
                writer._root_object[NameObject(key)] = page2.trailer["/Root"][key]
        now = datetime.datetime.now().astimezone().strftime("D:%Y%m%d%H%M%S%z")
        writer.add_metadata({**page1.metadata, "/ModDate": now[:-2] + "'" + now[-2:] + "'"})
        with open(args.out, "wb") as fh:
            writer.write(fh)

    size = args.out.stat().st_size
    print(f"wrote {args.out} ({size / 1024 / 1024:.2f} MiB)")
    if size > LIMIT:
        sys.exit("resume PDF is over 3 MiB")


if __name__ == "__main__":
    main()
