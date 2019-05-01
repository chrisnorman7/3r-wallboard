from flask import abort, Flask, jsonify, render_template, request
from requests import Session

base_url = 'https://www.3r.org.uk/'
directory_url = base_url + 'directory.json'

http = Session()
app = Flask(__name__)
app.config['3R_USERNAME'] = None
app.config['3R_PASSWORD'] = None
app.config['3R_AUTHENTICATED'] = False


def get_auth():
    auth = app.config['3R_USERNAME'], app.config['3R_PASSWORD']
    if not all(auth):
        return abort(500, 'You must supply a username and a password.')
    return auth


def get_url(url):
    """Get a URL, returning abort or the content retrieved from the URL."""
    r = http.get(url, auth=get_auth())
    app.config['3R_AUTHENTICATED'] = r.ok
    if r.ok:
        return r.content
    return abort(r.status_code)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/authenticated/')
def authenticated():
    return jsonify(app.config['3R_AUTHENTICATED'])


@app.route('/directory/')
def directory():
    return get_url(directory_url)


@app.route('/login/', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return abort(405)
    app.config['3R_USERNAME'] = request.form['username']
    app.config['3R_PASSWORD'] = request.form['password']
    return 'Thanks.'


@app.route('/thumb/<int:id>')
def thumb(id):
    return get_url(f'https://www.3r.org.uk/directory/{id}/photos/thumb.jpg',)


if __name__ == '__main__':
    app.run()
