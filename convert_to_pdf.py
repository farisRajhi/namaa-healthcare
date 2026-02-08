#!/usr/bin/env python
"""
Convert NAMAA_VISION_AND_FUTURE.md to PDF
"""

import markdown2
from xhtml2pdf import pisa
from pathlib import Path
import io

def convert_markdown_to_pdf():
    # Read the markdown file
    md_file = Path("NAMAA_VISION_AND_FUTURE.md")
    pdf_file = Path("NAMAA_VISION_AND_FUTURE.pdf")

    print(f"Reading markdown file: {md_file}")
    with open(md_file, 'r', encoding='utf-8') as f:
        markdown_content = f.read()

    # Convert markdown to HTML
    print("Converting markdown to HTML...")
    html_content = markdown2.markdown(
        markdown_content,
        extras=[
            'tables',
            'fenced-code-blocks',
            'header-ids',
            'toc',
            'break-on-newline'
        ]
    )

    # Create styled HTML document
    styled_html = f"""
    <!DOCTYPE html>
    <html dir="ltr" lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Namaa - Vision and Future Development Document</title>
        <style>
            @page {{
                size: A4;
                margin: 2cm;
                @top-center {{
                    content: "Namaa - Vision & Future Development";
                    font-size: 9pt;
                    color: #666;
                }}
                @bottom-center {{
                    content: "Page " counter(page) " of " counter(pages);
                    font-size: 9pt;
                    color: #666;
                }}
            }}

            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 100%;
                margin: 0;
                padding: 0;
            }}

            h1 {{
                color: #2563eb;
                font-size: 28pt;
                margin-top: 20pt;
                margin-bottom: 15pt;
                page-break-after: avoid;
                border-bottom: 3pt solid #2563eb;
                padding-bottom: 5pt;
            }}

            h2 {{
                color: #1e40af;
                font-size: 20pt;
                margin-top: 18pt;
                margin-bottom: 12pt;
                page-break-after: avoid;
                border-bottom: 1pt solid #93c5fd;
                padding-bottom: 3pt;
            }}

            h3 {{
                color: #1e3a8a;
                font-size: 16pt;
                margin-top: 15pt;
                margin-bottom: 10pt;
                page-break-after: avoid;
            }}

            h4 {{
                color: #1e293b;
                font-size: 13pt;
                margin-top: 12pt;
                margin-bottom: 8pt;
                page-break-after: avoid;
            }}

            p {{
                margin: 8pt 0;
                text-align: justify;
            }}

            ul, ol {{
                margin: 8pt 0;
                padding-left: 25pt;
            }}

            li {{
                margin: 4pt 0;
            }}

            table {{
                border-collapse: collapse;
                width: 100%;
                margin: 12pt 0;
                page-break-inside: avoid;
            }}

            th {{
                background-color: #2563eb;
                color: white;
                padding: 8pt;
                text-align: left;
                font-weight: bold;
            }}

            td {{
                border: 1pt solid #ddd;
                padding: 8pt;
            }}

            tr:nth-child(even) {{
                background-color: #f8fafc;
            }}

            code {{
                background-color: #f1f5f9;
                padding: 2pt 4pt;
                border-radius: 3pt;
                font-family: 'Courier New', monospace;
                font-size: 9pt;
            }}

            pre {{
                background-color: #1e293b;
                color: #f1f5f9;
                padding: 12pt;
                border-radius: 5pt;
                overflow-x: auto;
                margin: 10pt 0;
                page-break-inside: avoid;
            }}

            pre code {{
                background-color: transparent;
                color: inherit;
                padding: 0;
            }}

            blockquote {{
                border-left: 4pt solid #2563eb;
                padding-left: 15pt;
                margin: 10pt 0;
                color: #475569;
                font-style: italic;
            }}

            hr {{
                border: none;
                border-top: 1pt solid #cbd5e1;
                margin: 20pt 0;
            }}

            strong {{
                color: #1e293b;
                font-weight: 600;
            }}

            em {{
                color: #475569;
            }}

            .page-break {{
                page-break-before: always;
            }}

            /* Specific styles for sections */
            #executive-summary {{
                background-color: #eff6ff;
                padding: 15pt;
                border-radius: 5pt;
                margin: 15pt 0;
            }}

            /* Table of contents styling */
            #table-of-contents + ol {{
                column-count: 2;
                column-gap: 20pt;
            }}

            /* Ensure proper page breaks */
            h1, h2 {{
                page-break-after: avoid;
            }}

            table, figure {{
                page-break-inside: avoid;
            }}
        </style>
    </head>
    <body>
        {html_content}
    </body>
    </html>
    """

    print("Generating PDF...")
    # Convert HTML to PDF
    with open(pdf_file, 'wb') as pdf_output:
        pisa_status = pisa.CreatePDF(
            src=io.StringIO(styled_html),
            dest=pdf_output,
            encoding='utf-8'
        )

    if pisa_status.err:
        raise Exception(f"PDF generation failed with error code: {pisa_status.err}")

    print(f"✓ PDF successfully created: {pdf_file}")
    print(f"✓ File size: {pdf_file.stat().st_size / 1024:.1f} KB")

    return pdf_file

if __name__ == "__main__":
    try:
        pdf_path = convert_markdown_to_pdf()
        print(f"\n✓ Success! PDF file created at: {pdf_path.absolute()}")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
