from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter

from bs4 import BeautifulSoup
from flask import abort, Flask, jsonify, render_template, request
from gevent import get_hub
from gevent.pool import Pool
from gevent.pywsgi import WSGIServer
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


def get_url(url, auth=True):
    """Get a URL, returning abort or the content retrieved from the URL."""
    if auth:
        auth = get_auth()
    else:
        auth = None
    r = http.get(url, auth=auth)
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


def textual_stats(url):
    s = BeautifulSoup(get_url(url, auth=False), 'html.parser')
    rows = s.find_all('table')[2].find_all('tr')
    try:
        unanswered = int(rows[4].find_all('td')[0].text)
        oldest = rows[5].find_all('td')[0].text.split('(')[1].strip(')')
    except ValueError:
        unanswered = int(rows[3].find_all('td')[0].text)
        oldest = rows[4].find_all('td')[0].text.split('(')[1].strip(')')
    return jsonify(dict(unanswered=unanswered, oldest=oldest))


@app.route('/email/')
def get_email_stats():
    return textual_stats('http://www.ear-mail.org.uk/')


@app.route('/sms/')
def sms():
    return textual_stats('http://smsstatus.samaritans.org/')


parser = ArgumentParser(formatter_class=ArgumentDefaultsHelpFormatter)

parser.add_argument(
    '-i', '--interface', default='0.0.0.0', help='The interface to bind to'
)

parser.add_argument(
    '-p', '--port', type=int, default=8398, help='The port to listen on'
)

parser.add_argument(
    '-d', '--debug', action='store_true', default=False,
    help='Enable debugging mode'
)


if __name__ == '__main__':
    args = parser.parse_args()
    app.config['DEBUG'] = args.debug
    get_hub().NOT_ERROR += (KeyboardInterrupt,)
    http_server = WSGIServer((args.interface, args.port), app, spawn=Pool())
    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        pass
