#!/usr/bin/env python3
"""Stempelt vor jeder Veröffentlichung eine neue Version in index.html (umgeht den 10-Minuten-Cache von GitHub Pages)."""
import re, datetime, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
now = datetime.datetime.now()
s = p.read_text(encoding='utf-8')
s = re.sub(r'(<meta name="app-version" content=")[^"]*(")', r'\g<1>%s\2' % now.strftime('%Y-%m-%d %H:%M'), s)
s = re.sub(r'(\.(?:css|js)\?v=)\d+', r'\g<1>%s' % now.strftime('%Y%m%d%H%M'), s)
p.write_text(s, encoding='utf-8')
print('Version gestempelt:', now.strftime('%Y-%m-%d %H:%M'))
