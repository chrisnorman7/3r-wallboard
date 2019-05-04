"""Update index.html with random get params."""

import os.path
import re
import sys

import main

# This regexp is used so that the static file editor can bump version numbers
# in index.html.
editor_filename_regexp = '%s[?][0-9]+'


def file_updated(app, path):
    """The file at the given path has been updated."""
    filename = os.path.basename(path)

    def repl(m):
        """Used with re.sub."""
        return '%s?%d' % (filename, os.path.getmtime(path))

    index_path = os.path.join(app.jinja_loader.searchpath[0], 'index.html')
    with open(index_path, 'r') as f:
        code = f.read()  # Get the code.
    # Let's build a new regular expression, based on the filename they're
    # editing.
    # We use just the filename, not the path.
    c = re.compile(editor_filename_regexp % filename)
    if not re.findall(c, code):
        raise RuntimeError(
            'No mention of "%s" found in index.html.' % filename
        )
    # Alter the code in memory.
    code = re.sub(c, repl, code)
    # Now write the file back to index.html.
    with open(index_path, 'w') as f:
        f.write(code)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('You must provide 1 - and only 1 - filename.')
    else:
        filename = sys.argv[1]
        try:
            file_updated(main.app, filename)
            print('Done.')
        except RuntimeError as e:
            print(*e.args)
