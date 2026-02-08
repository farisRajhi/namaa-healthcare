#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Convert NAMAA_VISION_AND_FUTURE.md to PDF
"""

import markdown2
from xhtml2pdf import pisa
from pathlib import Path
import io
import sys

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

    # Create styled HTML document with simpler CSS for xhtml2pdf
    styled_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Namaa - Vision and Future Development Document</title>
        <style>
            @page {{
                size: A4;
                margin: 1.5cm;
            }}

            body {{
                font-family: 'Arial', 'Helvetica', sans-serif;
                line-height: 1.6;
                color: #333;
                font-size: 11pt;
            }}

            h1 {{
                color: #2563eb;
                font-size: 24pt;
                margin-top: 15pt;
                margin-bottom: 12pt;
                border-bottom: 3pt solid #2563eb;
                padding-bottom: 4pt;
            }}

            h2 {{
                color: #1e40af;
                font-size: 18pt;
                margin-top: 14pt;
                margin-bottom: 10pt;
                border-bottom: 1pt solid #93c5fd;
                padding-bottom: 3pt;
            }}

            h3 {{
                color: #1e3a8a;
                font-size: 14pt;
                margin-top: 12pt;
                margin-bottom: 8pt;
            }}

            h4 {{
                color: #1e293b;
                font-size: 12pt;
                margin-top: 10pt;
                margin-bottom: 6pt;
            }}

            p {{
                margin: 6pt 0;
                text-align: justify;
            }}

            ul, ol {{
                margin: 6pt 0;
                padding-left: 20pt;
            }}

            li {{
                margin: 3pt 0;
            }}

            table {{
                border-collapse: collapse;
                width: 100%;
                margin: 10pt 0;
            }}

            th {{
                background-color: #2563eb;
                color: white;
                padding: 6pt;
                text-align: left;
                font-weight: bold;
            }}

            td {{
                border: 1pt solid #ddd;
                padding: 6pt;
            }}

            tr:nth-child(even) {{
                background-color: #f8fafc;
            }}

            code {{
                background-color: #f1f5f9;
                padding: 2pt 4pt;
                font-family: 'Courier New', monospace;
                font-size: 9pt;
            }}

            pre {{
                background-color: #1e293b;
                color: #f1f5f9;
                padding: 10pt;
                overflow-x: auto;
                margin: 8pt 0;
            }}

            pre code {{
                background-color: transparent;
                color: inherit;
                padding: 0;
            }}

            blockquote {{
                border-left: 3pt solid #2563eb;
                padding-left: 12pt;
                margin: 8pt 0;
                color: #475569;
                font-style: italic;
            }}

            hr {{
                border: none;
                border-top: 1pt solid #cbd5e1;
                margin: 15pt 0;
            }}

            strong {{
                color: #1e293b;
                font-weight: 600;
            }}

            em {{
                color: #475569;
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
            src=styled_html,
            dest=pdf_output,
            encoding='utf-8'
        )

    if pisa_status.err:
        raise Exception(f"PDF generation failed with error code: {pisa_status.err}")

    print(f"SUCCESS! PDF created: {pdf_file}")
    print(f"File size: {pdf_file.stat().st_size / 1024:.1f} KB")

    return pdf_file

if __name__ == "__main__":
    try:
        # Set UTF-8 encoding for console output
        if sys.platform == 'win32':
            try:
                sys.stdout.reconfigure(encoding='utf-8')
            except:
                pass

        pdf_path = convert_markdown_to_pdf()
        print(f"\nSuccess! PDF file created at: {pdf_path.absolute()}")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
