"""Update index.html with random get params."""

import os.path
import re

from random_password import random_password

# This regexp is used so that the static file editor can bump version numbers
# in index.html.
editor_filename_regexp = '(%s[?])([0-9]+)'


def repl(m):
    """Used with re.sub."""
    filename = m.groups()[0]
    return '%s%s' % (filename, random_password())


def file_updated(app, filename):
    index_path = os.path.join(app.jinja_loader.searchpath[0], 'index.html')
    with open(index_path, 'r') as f:
        code = f.read()  # Get the code.
    # Let's build a new regular expression, based on the filename they're
    # editing.
    # We use just the filename, not the path.
    c = re.compile(editor_filename_regexp % filename)
    # Alter the code in memory.
    code = re.sub(c, repl, code)
    # Now write the file back to index.html.
    with open(index_path, 'w') as f:
        f.write(code)
