#!/usr/bin/env python3
"""
Generate a minimal, clean PDF journal from JSON logs and images.
"""

import json
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfgen import canvas


# Minimal color scheme
TEXT_COLOR = HexColor('#1a1a1a')  # Near black
LIGHT_GRAY = HexColor('#666666')  # Gray for dates
DIVIDER_COLOR = HexColor('#e0e0e0')  # Light gray divider
BOX_COLOR = HexColor('#f5f5f5')  # Light gray background for title box
BORDER_COLOR = HexColor('#cccccc')  # Border for title box


class MinimalCanvas(canvas.Canvas):
    """Minimal canvas with page numbers only."""

    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self.pages = []

    def showPage(self):
        self.pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self.pages)
        for page_num, page in enumerate(self.pages, 1):
            self.__dict__.update(page)
            self.draw_page_number(page_num, page_count)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_num, page_count):
        """Draw minimal page number."""
        self.setFont('Helvetica', 8)
        self.setFillColor(LIGHT_GRAY)
        self.drawCentredString(letter[0] / 2, 0.5 * inch, str(page_num))


def create_styles():
    """Create minimal paragraph styles."""
    styles = getSampleStyleSheet()

    # Title style - bold and prominent
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=36,
        textColor=TEXT_COLOR,
        spaceAfter=40,
        spaceBefore=20,
        alignment=TA_LEFT,
        leading=42
    )

    # Date style - small and subtle
    date_style = ParagraphStyle(
        'Date',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        textColor=LIGHT_GRAY,
        spaceBefore=5,
        spaceAfter=12,
        leading=11
    )

    # Body text style - clean and readable
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=TEXT_COLOR,
        spaceAfter=8,
        leading=14,
        alignment=TA_LEFT
    )

    return {
        'title': title_style,
        'date': date_style,
        'body': body_style
    }


def process_text(text):
    """Process text to handle line breaks and formatting."""
    # Replace newlines with <br/> tags for ReportLab
    text = text.replace('\n', '<br/>')
    # Escape special characters
    text = text.replace('&', '&amp;')
    text = text.replace('<br/>', '<br/>').replace('< ', '&lt; ')
    return text


def create_journal_pdf(json_path, output_path):
    """Create a minimal, clean PDF from JSON data."""

    # Load JSON data
    with open(json_path, 'r') as f:
        data = json.load(f)

    notebook_name = data.get('name', 'Journal')
    logs = data.get('logs', [])

    # Create PDF with generous margins
    pdf = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=1 * inch,
        leftMargin=1 * inch,
        topMargin=1 * inch,
        bottomMargin=0.75 * inch,
        canvasmaker=MinimalCanvas
    )

    styles = create_styles()
    story = []

    from reportlab.platypus import HRFlowable

    # Simple title
    story.append(Spacer(1, 0.5 * inch))
    story.append(Paragraph(notebook_name, styles['title']))
    story.append(Spacer(1, 0.3 * inch))

    # Available width for content
    available_width = letter[0] - 2 * inch

    # Process each log entry
    for idx, log in enumerate(logs, 1):
        entry_id = log.get('id', idx)
        date = log.get('date', 'No date')
        text = log.get('text', '')
        attachments = log.get('attachments', [])

        # Create date box (title section with box around it)
        date_para = Paragraph(date, styles['date'])
        date_table = Table([[date_para]], colWidths=[available_width])
        date_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BOX_COLOR),
            ('BOX', (0, 0), (-1, -1), 1, BORDER_COLOR),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(date_table)
        story.append(Spacer(1, 15))

        # Process images if present
        images = []
        if attachments:
            for attachment in attachments:
                if attachment.get('type') == 'image':
                    filename = attachment.get('filename')
                    img_path = Path(json_path).parent / 'sawyer' / 'attachments' / filename

                    if img_path.exists():
                        try:
                            img = Image(str(img_path))
                            # Scale for right column (about 40% of page width)
                            max_img_width = available_width * 0.4
                            max_img_height = 3 * inch

                            aspect = img.imageHeight / img.imageWidth
                            img.drawWidth = max_img_width
                            img.drawHeight = max_img_width * aspect

                            if img.drawHeight > max_img_height:
                                img.drawHeight = max_img_height
                                img.drawWidth = max_img_height / aspect

                            images.append(img)
                        except Exception as e:
                            print(f"Warning: Could not load image {filename}: {e}")

        # Body text
        processed_text = process_text(text)
        text_para = Paragraph(processed_text, styles['body'])

        # Create layout based on whether images exist
        if images:
            # Two-column layout: text left, images right
            text_col_width = available_width * 0.55
            img_col_width = available_width * 0.45

            # Stack images vertically in right column
            img_elements = []
            for img in images:
                img_elements.append(img)
                img_elements.append(Spacer(1, 10))

            # Remove last spacer
            if img_elements:
                img_elements.pop()

            # Create table with text and images
            content_table = Table(
                [[text_para, img_elements]],
                colWidths=[text_col_width, img_col_width]
            )
            content_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))
            story.append(content_table)
        else:
            # Just text, full width
            story.append(text_para)

        # Spacing between entries
        story.append(Spacer(1, 25))
        story.append(HRFlowable(width="100%", thickness=0.5, color=DIVIDER_COLOR,
                               spaceBefore=0, spaceAfter=25))

    # Build PDF
    print(f"Generating PDF: {output_path}")
    pdf.build(story)
    print(f"✓ Minimal journal PDF created: {output_path}")


if __name__ == '__main__':
    json_file = Path(__file__).parent / 'sawyer.json'
    output_file = Path(__file__).parent / 'Sawyer_Journal.pdf'

    create_journal_pdf(str(json_file), str(output_file))
