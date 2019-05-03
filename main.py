import os

from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
from datetime import datetime, timedelta
from urllib.parse import urlencode

from bs4 import BeautifulSoup
from dateparser import parse as parse_date
from flask import abort, Flask, jsonify, render_template, request
from gevent import get_hub
from gevent.pool import Pool
from gevent.pywsgi import WSGIServer
from requests import Session

ignored_shift_ids = [
    50605530,  # On Holiday
    50607143,  # Ofice PC Booking
]

date_format = '%Y-%m-%d'
time_format = '%H:%M'
shift_history_threshold = 5

base_url = 'https://www.3r.org.uk/'
directory_url = base_url + 'directory.json'
volunteer_url = base_url + 'directory/%d?format=json'
shift_url = base_url + 'shift.json'

http = Session()
app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['3R_USERNAME'] = None
app.config['3R_PASSWORD'] = None
app.config['3R_AUTHENTICATED'] = False
app.config['SHIFT_VERSION'] = 0


def get_auth():
    auth = app.config['3R_USERNAME'], app.config['3R_PASSWORD']
    if not all(auth):
        return abort(500, 'You must supply a username and a password.')
    return auth


def get_url(url, auth=True, json=False):
    """Get a URL, returning abort or the content retrieved from the URL."""
    if auth:
        auth = get_auth()
    else:
        auth = None
    r = http.get(url, auth=auth)
    app.config['3R_AUTHENTICATED'] = r.ok
    if r.ok:
        if json:
            return r.json()
        return r.content
    return abort(r.status_code)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/single/')
def single():
    return render_template('index.html', single=True)


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


images = {}


@app.route('/thumb/<int:id>')
def thumb(id):
    if id not in images:
        images[id] = get_url(f'{base_url}directory/{id}/photos/thumb.jpg',)
    return images[id]


def textual_stats(url):
    s = BeautifulSoup(get_url(url, auth=False), 'html.parser')
    rows = s.find_all('table')[2].find_all('tr')
    try:
        try:
            unanswered = int(rows[4].find_all('td')[0].text)
            oldest = rows[5].find_all('td')[0].text.split('(')[1].strip(')')
        except ValueError:
            unanswered = 0
            oldest = '00:00'
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


@app.route('/shifts/')
def shifts():
    now = datetime.now()
    tomorrow = now + timedelta(days=1)
    start_string = now.strftime(date_format)
    end_string = tomorrow.strftime(date_format)
    e = urlencode(dict(start_date=start_string, end_date=end_string))
    shifts = get_url(shift_url + '?' + e, json=True)['shifts']
    results = []
    volunteers = {}
    for shift in shifts:
        sid = shift['id']
        if sid in ignored_shift_ids:
            continue
        rota_name = shift['rota']['name']
        start = parse_date(shift['start_datetime'])
        end = start + timedelta(seconds=shift['duration'])
        ts = now.timestamp()
        if start.timestamp() < ts and end.timestamp() > ts:
            start = start.strftime(time_format)
            end = end.strftime(time_format)
            if start == end:
                time = 'All day'
            else:
                time = f'{start}-{end}'
            name = rota_name
            if shift['title']:
                name = f'{name} - {shift["title"]}'
            d = dict(name=name, time=time, volunteers=[], id=sid)
            for signup in shift['volunteer_shifts']:
                volunteer = signup['volunteer']
                id = volunteer['id']
                if id not in volunteers:
                    volunteers[id] = get_url(
                        volunteer_url % id, json=True
                    )['volunteer']
                volunteer = volunteers[id]
                props = volunteer['volunteer_properties']
                volunteer['details'] = []
                for prop in props:
                    code = prop['code']
                    name = prop['name']
                    value = prop['value']
                    if code.startswith('telephone'):
                        volunteer['details'].append(
                            dict(name=name, value=value)
                        )
                    elif name == 'Friendly Name':
                        volunteer['name'] = value
                    else:
                        continue  # Ignore all other properties.
                d['volunteers'].append(
                    dict(
                        name=volunteer['name'], id=id,
                        details=volunteer['details']
                    )
                )
            results.append(d)
    return jsonify(results)


@app.route('/version/')
def version():
    return os.popen('git describe --tags --always').read().strip()


@app.route('/news/')
def news():
    return jsonify(get_url(base_url + 'news.json', json=True)['news_items'])


parser = ArgumentParser(formatter_class=ArgumentDefaultsHelpFormatter)

parser.add_argument(
    '-i', '--interface', default='0.0.0.0', help='The interface to bind to'
)

parser.add_argument(
    '-p', '--port', type=int, default=7267, help='The port to listen on'
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
