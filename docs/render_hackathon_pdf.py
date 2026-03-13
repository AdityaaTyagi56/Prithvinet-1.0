from pathlib import Path

from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def build_pdf() -> Path:
    docs_dir = Path(__file__).resolve().parent
    md_path = docs_dir / "hackathon_plan.md"
    pdf_path = docs_dir / "PrithviNet_Hackathon_Plan.pdf"
    lines = md_path.read_text(encoding="utf-8").splitlines()

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="BodyHack",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            alignment=TA_LEFT,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading1Hack",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            spaceBefore=8,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading2Hack",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading3Hack",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            spaceBefore=6,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletHack",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            leftIndent=12,
            firstLineIndent=-8,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeHack",
            parent=styles["BodyText"],
            fontName="Courier",
            fontSize=9.5,
            leading=12,
            leftIndent=8,
            spaceAfter=4,
        )
    )

    story = []
    for raw in lines:
        line = raw.strip()
        if not line:
            story.append(Spacer(1, 4))
            continue

        escaped = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if line.startswith("# "):
            story.append(Paragraph(escaped[2:].strip(), styles["Heading1Hack"]))
        elif line.startswith("## "):
            story.append(Paragraph(escaped[3:].strip(), styles["Heading2Hack"]))
        elif line.startswith("### "):
            story.append(Paragraph(escaped[4:].strip(), styles["Heading3Hack"]))
        elif line.startswith("- "):
            story.append(Paragraph("&bull; " + escaped[2:].strip(), styles["BulletHack"]))
        elif len(line) > 2 and line[0].isdigit() and line[1] == ".":
            story.append(Paragraph(escaped, styles["BodyHack"]))
        elif line.startswith("`") and line.endswith("`"):
            story.append(Paragraph(escaped[1:-1], styles["CodeHack"]))
        else:
            story.append(Paragraph(escaped, styles["BodyHack"]))

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    doc.build(story)
    return pdf_path


if __name__ == "__main__":
    print(build_pdf())