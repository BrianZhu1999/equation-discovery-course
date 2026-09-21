"""Validate the static export before pushing it to GitHub Pages."""
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('href', 'src') and value:
                self.links.append(value)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('site', type=Path, nargs='?', default=Path(__file__).resolve().parents[1])
    root = parser.parse_args().site.resolve()
    course = json.loads((root / 'data/course.json').read_text(encoding='utf-8'))
    assert len(course['lessons']) == 76
    assert len(course['calendar']) == 30
    assert sum(map(len, course['questions'].values())) == 301
    assert len({p['key'] for p in course['lessons']}) == 76
    assert all((root / p['card_url']).is_file() for p in course['lessons'])
    for p in course['lessons']:
        assert not p['pdf_path'] and not p['source_path']
    errors, count = [], 0
    for file in root.rglob('*'):
        if not file.is_file() or '.git' in file.parts:
            continue
        assert file.suffix.lower() not in {'.pdf', '.zip', '.sqlite', '.log', '.csv'}, str(file)
        assert file.name not in {'study_state.json', 'progress.csv'}, str(file)
        if file.suffix in {'.html', '.json', '.css', '.js', '.md', '.py', '.cjs'}:
            text = file.read_text(encoding='utf-8')
            # The checker contains the expressions; generated public payload must not.
            if file.suffix not in {'.py', '.cjs'}:
                assert not re.search(r'[CF]:\\|C:/Users/|Zotero[/\\]storage|github_pat_[A-Za-z0-9_]{15,}|gh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY', text), str(file)
        if file.suffix != '.html':
            continue
        count += 1
        links = Links(); links.feed(text)
        for url in links.links:
            parts = urlsplit(url)
            if parts.scheme or parts.netloc or not parts.path:
                continue
            if parts.path.startswith('/'):
                errors.append((str(file.relative_to(root)), 'absolute local URL: ' + url)); continue
            target = (file.parent / unquote(parts.path)).resolve()
            if target.is_dir(): target = target / 'index.html'
            if not target.is_relative_to(root) or not target.is_file():
                errors.append((str(file.relative_to(root)), url))
    assert not errors, errors[:25]
    atlas = json.loads((root / 'spectrum/spectrum_data.json').read_text(encoding='utf-8'))
    assert len(atlas['papers']) == 61
    for p in atlas['papers']:
        assert (root / 'spectrum' / p['card_url']).is_file()
    print(json.dumps({'html_pages_checked': count, 'papers': 76, 'questions': 301, 'atlas_papers': len(atlas['papers']), 'broken_local_links': 0, 'private_materials': 0}))

if __name__ == '__main__':
    main()
