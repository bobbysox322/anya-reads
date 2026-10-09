#!/usr/bin/env python3
"""Inline CSS, JS and the Andika font into a single self-contained ../index.html."""
import pathlib
d = pathlib.Path(__file__).parent
fonts = {k: (d / f).read_text().strip() for k, f in [('BOLD', 'andika-bold.b64'), ('REG', 'andika-reg.b64')]}
css = (d / 'style.css').read_text().replace('%%FONT_BOLD%%', fonts['BOLD']).replace('%%FONT_REG%%', fonts['REG'])
html = (d / 'index.template.html').read_text().replace('%%CSS%%', css).replace('%%DATA%%', (d / 'data.js').read_text()).replace('%%APP%%', (d / 'app.js').read_text())
(d.parent / 'index.html').write_text(html)
print('wrote', d.parent / 'index.html', len(html), 'bytes')
