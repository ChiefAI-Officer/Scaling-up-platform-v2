#!/usr/bin/env python3
"""Build the July 10 status overlay and post-cutoff progress delta from tracked docs."""

from __future__ import annotations

import argparse
import io
import importlib.util
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


EXPECTED_ROWS = [
    30, 32, 33, 35, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
    50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
    66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
    83, 84, 85, 86, 87,
]
EXPECTED_TALLY = {"DONE": 50, "PARTIAL": 0, "NEEDS DECISION": 3}
STATUS_DATE_LONG = "12 August 2026"
STATUS_DATE_FOOTER = "12 AUG 2026"
PDF_DEPENDENCIES = ("pdfplumber", "pypdf", "reportlab")


@dataclass(frozen=True)
class LedgerRow:
    number: int
    area: str
    status: str
    residual: str


@dataclass(frozen=True)
class DeltaRow:
    number: int
    outcome: str
    evidence: str
    rollout: str


def repository_root() -> Path:
    return Path(__file__).resolve().parents[2]


def require_pdf_dependencies() -> None:
    missing = [
        dependency
        for dependency in PDF_DEPENDENCIES
        if importlib.util.find_spec(dependency) is None
    ]
    if missing:
        requirements = Path(__file__).with_name(
            "requirements-jul10-closeout.txt"
        )
        raise RuntimeError(
            "Missing PDF dependencies: "
            + ", ".join(missing)
            + f". Install them with: python3 -m pip install -r {requirements}"
        )


def marked_lines(markdown: str, start: str, end: str) -> list[str]:
    start_index = markdown.find(start)
    end_index = markdown.find(end)
    if start_index < 0 or end_index <= start_index:
        raise ValueError(f"Missing or invalid marker pair: {start} / {end}")
    return markdown[start_index + len(start) : end_index].splitlines()


def table_cells(line: str) -> list[str]:
    if not line.startswith("|") or not line.endswith("|"):
        return []
    return [cell.strip() for cell in line[1:-1].split("|")]


def parse_ledger(path: Path) -> list[LedgerRow]:
    rows: list[LedgerRow] = []
    lines = marked_lines(
        path.read_text(encoding="utf-8"),
        "<!-- JUL10_LEDGER_START -->",
        "<!-- JUL10_LEDGER_END -->",
    )
    for line in lines:
        cells = table_cells(line)
        if len(cells) != 8 or not re.fullmatch(r"#\d+", cells[0]):
            continue
        rows.append(
            LedgerRow(
                number=int(cells[0][1:]),
                area=cells[1],
                status=cells[3],
                residual=cells[6],
            )
        )

    numbers = [row.number for row in rows]
    tally = Counter(row.status for row in rows)
    normalized_tally = {
        status: tally.get(status, 0)
        for status in ("DONE", "PARTIAL", "NEEDS DECISION")
    }
    if numbers != EXPECTED_ROWS:
        raise ValueError(f"Expected canonical row order {EXPECTED_ROWS}, found {numbers}")
    if normalized_tally != EXPECTED_TALLY:
        raise ValueError(
            f"Expected tally {EXPECTED_TALLY}, found {normalized_tally}"
        )
    if len(set(numbers)) != 53:
        raise ValueError("Ledger must contain 53 distinct rows")
    return rows


def parse_delta(path: Path) -> list[DeltaRow]:
    rows: list[DeltaRow] = []
    lines = marked_lines(
        path.read_text(encoding="utf-8"),
        "<!-- JUL10_DELTA_START -->",
        "<!-- JUL10_DELTA_END -->",
    )
    for line in lines:
        cells = table_cells(line)
        if len(cells) != 4 or not cells[0].isdigit():
            continue
        rows.append(
            DeltaRow(
                number=int(cells[0]),
                outcome=cells[1],
                evidence=cells[2],
                rollout=cells[3],
            )
        )
    if [row.number for row in rows] != list(range(1, 13)):
        raise ValueError("Progress delta must contain exactly twelve ordered outcomes")
    return rows


def group_lines(words: list[dict]) -> list[tuple[float, list[dict]]]:
    grouped: list[list] = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        found = None
        for line in reversed(grouped[-4:]):
            if abs(line[0] - word["top"]) < 2:
                found = line
                break
        if found is None:
            grouped.append([word["top"], [word]])
        else:
            found[1].append(word)
    result = []
    for top, line_words in sorted(grouped, key=lambda item: item[0]):
        line_words.sort(key=lambda item: item["x0"])
        result.append((top, line_words))
    return result


def inspect_status_rows(source: Path) -> list[list[dict]]:
    import pdfplumber

    pages: list[list[dict]] = []
    current_item: int | None = None
    with pdfplumber.open(source) as pdf:
        for page in pdf.pages:
            page_start_item = current_item
            lines = group_lines(
                page.extract_words(
                    x_tolerance=1,
                    y_tolerance=2,
                    keep_blank_chars=False,
                )
            )
            headings: list[tuple[float, int]] = []
            status_rows: list[dict] = []
            for top, words in lines:
                text = " ".join(word["text"] for word in words)
                match = re.match(r"#(\d+)\b", text.strip())
                if match:
                    current_item = int(match.group(1))
                    headings.append((top, current_item))
                # A previously generated status edition retains the source
                # text but interleaves the old overlay's text extraction on
                # the same line. Accept either the pristine source line or a
                # prior derivative so the tracked ledger can regenerate a
                # fresh overlay without requiring an archived scratch copy.
                if "Status:" in text:
                    if current_item is None:
                        raise RuntimeError(
                            f"Status row on page {page.page_number} has no item"
                        )
                    status_rows.append(
                        {
                            "item": current_item,
                            "top": top,
                            "next_heading_top": None,
                        }
                    )
            if not status_rows:
                # Regeneration may use a prior status edition when the pristine
                # source PDF is unavailable. ReportLab emits every prior status
                # badge as a 14pt-high rounded curve beginning at x=48. Recover
                # those row anchors, then replace the prior overlay in place.
                # Repeatedly refreshed editions can contain several badges at
                # the same coordinate. De-duplicate by row position so they
                # still resolve to exactly the canonical 83 occurrences.
                badge_candidates = sorted(
                    (
                        curve
                        for curve in page.curves
                        if abs(curve.get("x0", -1) - 48) < 0.1
                        and abs(curve.get("height", -1) - 14) < 0.1
                        and round(curve.get("width", -1)) in {38, 53, 86}
                    ),
                    key=lambda curve: curve["top"],
                )
                prior_badges: list[dict] = []
                last_badge_top: float | None = None
                for badge in badge_candidates:
                    # Each refresh moves its replacement two points upward;
                    # cluster that chain of same-row badges while keeping
                    # genuinely adjacent tracker rows distinct.
                    if (
                        last_badge_top is not None
                        and badge["top"] - last_badge_top <= 3
                    ):
                        last_badge_top = badge["top"]
                        continue
                    prior_badges.append(badge)
                    last_badge_top = badge["top"]
                for badge in prior_badges:
                    preceding = [
                        (top, item)
                        for top, item in headings
                        if top < badge["top"]
                    ]
                    item = preceding[-1][1] if preceding else page_start_item
                    if item is None:
                        raise RuntimeError(
                            f"Prior status badge on page {page.page_number} has no item"
                        )
                    status_rows.append(
                        {
                            "item": item,
                            "top": badge["top"],
                            "next_heading_top": None,
                        }
                    )
            for row in status_rows:
                following = [top for top, _ in headings if top > row["top"]]
                if following:
                    row["next_heading_top"] = min(following)
            pages.append(status_rows)
    return pages


def fit_text(text: str, font: str, size: float, max_width: float) -> str:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    if stringWidth(text, font, size) <= max_width:
        return text
    shortened = text
    while shortened and stringWidth(shortened + "...", font, size) > max_width:
        shortened = shortened[:-1]
    return shortened.rstrip() + "..."


def overlay_note(row: LedgerRow) -> str:
    if row.status == "DONE":
        return f"{row.area} - verified satisfied; see canonical ledger."
    return f"{row.area} - {row.residual}"


def draw_overlay(page_rows: list[dict], width: float, height: float, ledger: dict[int, LedgerRow]) -> bytes:
    from reportlab.lib.colors import HexColor, white
    from reportlab.pdfgen import canvas

    colors = {
        "DONE": HexColor("#1E824C"),
        "PARTIAL": HexColor("#B26A00"),
        "NEEDS DECISION": HexColor("#522583"),
    }
    packet = io.BytesIO()
    layer = canvas.Canvas(packet, pagesize=(width, height), invariant=1)
    for found in page_rows:
        row = ledger.get(found["item"])
        if row is None:
            raise RuntimeError(f"No ledger row for item #{found['item']}")

        top = found["top"] - 2
        next_heading_top = found["next_heading_top"]
        bottom_top = next_heading_top - 8 if next_heading_top is not None else height - 38
        erase_height = max(18, bottom_top - top)
        y_bottom = height - (top + erase_height)
        layer.setFillColor(white)
        layer.rect(48, y_bottom, width - 84, erase_height, fill=1, stroke=0)

        baseline = height - top - 11
        badge_width = {"DONE": 38, "PARTIAL": 53, "NEEDS DECISION": 86}[row.status]
        layer.setFillColor(colors[row.status])
        layer.roundRect(48, baseline - 3, badge_width, 14, 4, fill=1, stroke=0)
        layer.setFillColor(white)
        layer.setFont("Helvetica-Bold", 6.8)
        layer.drawCentredString(48 + badge_width / 2, baseline + 1, row.status)

        note_x = 48 + badge_width + 7
        note = fit_text(overlay_note(row), "Helvetica", 7.5, width - note_x - 42)
        layer.setFillColor(HexColor("#241833"))
        layer.setFont("Helvetica", 7.5)
        layer.drawString(note_x, baseline, note)

    # Replace, rather than stack on top of, a footer from a prior status
    # edition. This band is below the report body and above no source content.
    layer.setFillColor(white)
    layer.rect(0, 0, width, 38, fill=1, stroke=0)
    layer.setStrokeColor(HexColor("#DCD4E7"))
    layer.setLineWidth(0.5)
    layer.line(48, 24, width - 48, 24)
    layer.setFillColor(HexColor("#6F6780"))
    layer.setFont("Helvetica", 6.4)
    layer.drawString(
        48,
        13,
        f"STATUS {STATUS_DATE_FOOTER}  |  GREEN: DONE  |  AMBER: PARTIAL  |  PURPLE: NEEDS DECISION  |  tracked ledger is authoritative",
    )
    layer.save()
    return packet.getvalue()


def content_streams(page) -> list:
    from pypdf.generic import ArrayObject

    contents = page.get("/Contents")
    if contents is None:
        return []
    resolved = contents.get_object()
    if isinstance(resolved, ArrayObject):
        return list(resolved)
    return [contents]


def remove_prior_status_overlays(page) -> int:
    from pypdf.generic import ArrayObject, NameObject

    streams = content_streams(page)
    survivors = [
        stream
        for stream in streams
        if b"STATUS " not in stream.get_object().get_data()
    ]
    removed = len(streams) - len(survivors)
    if removed:
        page[NameObject("/Contents")] = ArrayObject(survivors)
    return removed


def verify_single_status_overlay(output: Path) -> None:
    from pypdf import PdfReader

    expected = f"STATUS {STATUS_DATE_FOOTER}".encode("ascii")
    footer_pattern = re.compile(rb"STATUS \d{1,2} [A-Z]{3} \d{4}")
    reader = PdfReader(str(output))
    for page_number, page in enumerate(reader.pages, start=1):
        footer_tokens = [
            token
            for stream in content_streams(page)
            for token in footer_pattern.findall(stream.get_object().get_data())
        ]
        if footer_tokens != [expected]:
            raise RuntimeError(
                f"Page {page_number} must retain exactly one current status footer; "
                f"found {footer_tokens}"
            )


def build_status_overlay(source: Path, output: Path, rows: list[LedgerRow]) -> None:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject, TextStringObject

    status_pages = inspect_status_rows(source)
    source_reader = PdfReader(str(source))
    if len(status_pages) != len(source_reader.pages):
        raise RuntimeError("Page-count mismatch while locating status rows")
    status_count = sum(len(page_rows) for page_rows in status_pages)
    if status_count != 83:
        raise RuntimeError(f"Expected 83 status occurrences, found {status_count}")

    writer = PdfWriter()
    writer.clone_document_from_reader(source_reader)
    ledger = {row.number: row for row in rows}
    for index, page_rows in enumerate(status_pages):
        page = writer.pages[index]
        remove_prior_status_overlays(page)
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay = PdfReader(
            io.BytesIO(draw_overlay(page_rows, width, height, ledger))
        ).pages[0]
        page.merge_page(overlay, over=True)

    metadata = dict(source_reader.metadata or {})
    metadata[NameObject("/Title")] = TextStringObject(
        "Scaling Up Assessment Feedback - Canonical Closeout Status"
    )
    metadata[NameObject("/Subject")] = TextStringObject(
        f"Evidence-backed July 10 closeout status as of {STATUS_DATE_LONG}"
    )
    writer.add_metadata(metadata)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as stream:
        writer.write(stream)
    verify_single_status_overlay(output)


def build_progress_delta(output: Path, rows: list[DeltaRow]) -> None:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="DeltaTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=27,
            textColor=colors.HexColor("#522583"),
            alignment=TA_CENTER,
            spaceAfter=16,
        )
    )
    styles.add(
        ParagraphStyle(
            name="DeltaLead",
            parent=styles["BodyText"],
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#241833"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="DeltaCell",
            parent=styles["BodyText"],
            fontSize=8.2,
            leading=10.5,
            textColor=colors.HexColor("#241833"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="DeltaHeader",
            parent=styles["DeltaCell"],
            fontName="Helvetica-Bold",
            textColor=colors.white,
        )
    )
    styles.add(
        ParagraphStyle(
            name="DeltaSmall",
            parent=styles["BodyText"],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#6F6780"),
        )
    )

    story = [
        Paragraph("Scaling Up Platform Progress Delta", styles["DeltaTitle"]),
        Paragraph("August 1-7, 2026 | Prepared for review only", styles["DeltaLead"]),
        Paragraph(
            "<b>Twelve outcomes after the July 31 reporting cutoff.</b> "
            "Each outcome is merged and production-verified. Default-off and "
            "dormant capabilities are labelled explicitly and are not described "
            "as active customer-visible behavior.",
            styles["DeltaLead"],
        ),
        Spacer(1, 8),
    ]
    data = [
        [
            Paragraph("#", styles["DeltaHeader"]),
            Paragraph("Outcome", styles["DeltaHeader"]),
            Paragraph("Evidence", styles["DeltaHeader"]),
            Paragraph("Rollout truth", styles["DeltaHeader"]),
        ]
    ]
    for row in rows:
        data.append(
            [
                Paragraph(str(row.number), styles["DeltaCell"]),
                Paragraph(row.outcome, styles["DeltaCell"]),
                Paragraph(row.evidence, styles["DeltaCell"]),
                Paragraph(row.rollout, styles["DeltaCell"]),
            ]
        )
    table = Table(
        data,
        colWidths=[0.28 * inch, 1.65 * inch, 1.05 * inch, 3.75 * inch],
        repeatRows=1,
        hAlign="CENTER",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#522583")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DCD4E7")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F3FA")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 14),
            Paragraph(
                "<b>Excluded from the count:</b> row #33's decision disposition; "
                "GH #233's observational auditability surface; documentation, "
                "receipt, acceptance, and coordination PRs; and all work already "
                "included in the July 27-31 report.",
                styles["DeltaSmall"],
            ),
            Spacer(1, 8),
            Paragraph(
                "No production write, flag change, replay, backfill, customer "
                "email, or external send was performed to create this report. "
                "External distribution requires separate authorization.",
                styles["DeltaSmall"],
            ),
        ]
    )

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#DCD4E7"))
        canvas.line(0.65 * inch, 0.48 * inch, 7.85 * inch, 0.48 * inch)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#6F6780"))
        canvas.drawString(0.65 * inch, 0.31 * inch, "Scaling Up Platform | Evidence-backed progress delta")
        canvas.drawRightString(7.85 * inch, 0.31 * inch, f"Page {doc.page}")
        canvas.restoreState()

    document = SimpleDocTemplate(
        str(output),
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.62 * inch,
        title="Scaling Up Platform Progress Delta - August 1-7, 2026",
        author="Scaling Up Platform",
        subject="Twelve outcomes after the July 31 reporting cutoff",
        invariant=1,
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)


def arguments() -> argparse.Namespace:
    root = repository_root()
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate tracked sources only")
    parser.add_argument(
        "--source",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "Scaling-Up-Assessment-Feedback-Report-2026-07-10.pdf",
    )
    parser.add_argument("--output-dir", type=Path, default=root / "output" / "pdf")
    return parser.parse_args()


def main() -> None:
    args = arguments()
    root = repository_root()
    ledger_path = root / "docs" / "agents" / "jul10-feedback-closeout.md"
    delta_path = (
        root
        / "docs"
        / "agents"
        / "jul10-progress-delta-2026-08-01-to-2026-08-07.md"
    )
    ledger_rows = parse_ledger(ledger_path)
    delta_rows = parse_delta(delta_path)
    print("53 rows: 50 DONE / 0 PARTIAL / 3 NEEDS DECISION")
    print(f"Status date: {STATUS_DATE_LONG}")
    print("12 post-cutoff outcomes")
    if args.check:
        return
    if not args.source.is_file():
        raise FileNotFoundError(f"Source PDF not found: {args.source}")
    require_pdf_dependencies()

    status_output = (
        args.output_dir
        / "Scaling-Up-Assessment-Feedback-Report-2026-07-10-STATUS-2026-08-12.pdf"
    )
    delta_output = (
        args.output_dir
        / "Scaling-Up-Progress-Delta-2026-08-01-to-2026-08-07.pdf"
    )
    build_status_overlay(args.source, status_output, ledger_rows)
    build_progress_delta(delta_output, delta_rows)
    print(f"Wrote {status_output}")
    print(f"Wrote {delta_output}")


if __name__ == "__main__":
    main()
