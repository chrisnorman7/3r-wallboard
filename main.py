import os
import os.path
import re

from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter, FileType
from datetime import datetime, timedelta
from urllib.parse import urlencode

from bs4 import BeautifulSoup
from dateparser import parse as parse_date
from flask import (
    abort, Flask, jsonify, render_template, request, redirect, url_for
)
from gevent import get_hub
from gevent.pool import Pool
from gevent.pywsgi import WSGIServer
from requests import Session

ignored_rota_ids = [
    403,  # On holiday
    2381,  # Ofice PC Booking
    1496,  # Rye Hill Debrief
    720,  # Onley Debrief
]

special_rota_ids = [
    156,  # Duty Deputy
]

editor_filename_regexp = '(%s[?])([0-9]+)'
time_format = '%H:%M'
shift_history_threshold = 5

base_url = 'https://www.3r.org.uk/'
directory_url = base_url + 'directory'
volunteer_number_regexp = re.compile('^[^0-9]+([0-9]+)$')
volunteer_url = base_url + 'directory/%d?format=json'
shift_url = base_url + 'shift.json'

http = Session()
app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['3R_APIKEY'] = None


def get_url(url, auth=True, json=False):
    """Get a URL, returning abort or the content retrieved from the URL."""
    headers = {'user-agent': app.config['USER_AGENT']}
    if auth:
        headers['Authorization'] = f'APIKEY {app.config["3R_APIKEY"]}'
    r = http.get(url, headers=headers)
    if r.ok:
        if json:
            return r.json()
        return r.content
    return abort(r.status_code)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/directory/')
def directory():
    s = BeautifulSoup(get_url(directory_url), 'html.parser')
    tds = s.find_all(
        'td', attrs={'class': 'directory_list_property_friendly_name'}
    )
    results = []
    for td in tds:
        a = td.find('a')
        name = a.text
        d = {'name': name}
        m = volunteer_number_regexp.match(name)
        if m is None:
            d['number'] = 0
        else:
            d['number'] = int(m.groups()[0])
        href = a.get('href')
        d['url'] = 'https://www.3r.org.uk' + href
        d['id'] = int(href.split('/')[-1])
        d['on_leave'] = bool(td.find('img', attrs={'alt': 'On leave'}))
        results.append(d)
    results = sorted(results, key=lambda v: v['number'])
    return jsonify(results)


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
    table = s.find_all('table')[2]
    tds = [td.text for td in table.find_all('td')]
    if len(tds) == 7:
        # We're dealing with emails.
        unanswered = tds[4]
        oldest = tds[5]
    else:
        # We are dealing with texts.
        unanswered = tds[3]
        oldest = tds[4]
    unanswered = int(unanswered)
    oldest = oldest.split('(')[1].strip(')')
    return jsonify(dict(unanswered=unanswered, oldest=oldest))


@app.route('/email/')
def email():
    return textual_stats('http://www.ear-mail.org.uk/')


@app.route('/sms/')
def sms():
    return textual_stats('http://smsstatus.samaritans.org/')


@app.route('/shifts/')
def shifts():
    current_shifts = {}
    past_shifts = {}
    future_shifts = {}
    now = datetime.now()
    now_date = now.date()
    tomorrow = now + timedelta(days=1)
    tomorrow_date = tomorrow.date()
    yesterday = now - timedelta(days=1)
    yesterday_date = yesterday.date()
    e = urlencode(dict(start_date=yesterday_date, end_date=tomorrow_date))
    shifts = get_url(shift_url + '?' + e, json=True)['shifts']
    results = []
    volunteers = {}
    past_shift_latest = yesterday
    future_shift_earliest = tomorrow
    for shift in shifts:
        rid = shift['rota']['id']
        start = parse_date(shift['start_datetime'])
        start = datetime(
            start.year, start.month, start.day, start.hour, start.minute
        )
        end = start + timedelta(seconds=shift['duration'])
        shift_end_date = end.date()
        if rid in ignored_rota_ids or shift_end_date < now_date:
            continue
        shift['start'] = start
        shift['end'] = end
        if now < end:  # Shift ends in the future.
            if now < start:  # Shift also starts in the future.
                shift['type'] = 'future'
                future_shift_earliest = min(future_shift_earliest, start)
                future_shifts.setdefault(rid, []).append(shift)
            else:  # Shift is currently running.
                shift['type'] = 'present'
                current_shifts.setdefault(rid, []).append(shift)
        else:
            shift['type'] = 'past'
            past_shift_latest = max(past_shift_latest, start)
            past_shifts.setdefault(rid, []).append(shift)
    shifts.clear()
    for passed in past_shifts.values():
        shift = passed[-1]
        if shift['start'] == past_shift_latest:
            shifts.append(shift)
    for current in current_shifts.values():
        shifts.extend(current)
    for future in future_shifts.values():
        shift = future[0]
        if shift['start'] == future_shift_earliest:
            shifts.append(shift)
    for shift in shifts:
        rid = shift['rota']['id']
        if rid in special_rota_ids:
            shift_type = 'special'
        else:
            shift_type = shift['type']
        start = shift['start']
        end = shift['end']
        rota_name = shift['rota']['name']
        start_string = start.strftime(time_format)
        end_string = end.strftime(time_format)
        if start == end:
            time = 'All day'
        else:
            time = f'{start_string}-{end_string}'
        name = rota_name
        if shift['title']:
            name = f'{name} - {shift["title"]}'
        start_date = start.date()
        if start_date == tomorrow_date:
            prefix = "Tomorrow's "
        elif start_date == yesterday_date:
            prefix = "Yesterday's "
        else:
            prefix = ''
        name = f'{prefix} {name}'
        d = dict(
            name=name, type=shift_type, time=time, start=start, volunteers=[],
            id=rid
        )
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
    results = sorted(results, key=lambda r: r.pop('start'))
    return jsonify(results)


@app.route('/version/')
def version():
    return jsonify(
        os.path.getmtime(
            os.path.join(app.jinja_loader.searchpath[0], 'index.html')
        )
    )


@app.route('/news/')
def news():
    return jsonify(get_url(base_url + 'news.json', json=True)['news_items'])


parser = ArgumentParser(formatter_class=ArgumentDefaultsHelpFormatter)

parser.add_argument(
    '-k', '--api-key-file', default='api.key', type=FileType('r'),
    metavar='<KEYFILE>', help='The API key to use for logging into Three Rings'
)

parser.add_argument(
    '-u', '--user-agent-file', type=FileType('r'), default='user-agent.txt',
    help='The file containing the user agent string to be sent with requests'
)

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


parser.add_argument(
    '-a', '--allow-edits', action='store_true', default=False,
    help='Automatically create /edit route'
)


def repl(m):
    filename, i = m.groups()
    i = int(i)
    return '%s%d' % (filename, i + 1)


def editor(filename):
    index_path = os.path.join(app.jinja_loader.searchpath[0], 'index.html')
    path = os.path.join('static', filename)
    if not os.path.isfile(path):
        return abort(404, 'No such file: %s.' % path)
    if request.method == 'POST':
        code = request.form['code'].replace('\r\n', '\n')
        with open(path, 'w') as f:
            f.write(code)
        with open(index_path, 'r') as f:
            code = f.read()
        c = re.compile(editor_filename_regexp % filename)
        code = re.sub(c, repl, code)
        with open(index_path, 'w') as f:
            f.write(code)
        return redirect(url_for('editor', filename=filename))
    with open(path, 'r') as f:
        code = f.read()
    return render_template(
        'editor.html', filename=filename, contents=code, path=path
    )


if __name__ == '__main__':
    args = parser.parse_args()
    if args.allow_edits:
        app.logger.warning('Editor enabled!!!')
        app.route('/edit/<filename>', methods=['GET', 'POST'])(editor)
    app.config['DEBUG'] = args.debug
    app.config['3R_APIKEY'] = args.api_key_file.read()
    args.api_key_file.close()
    app.config['USER_AGENT'] = args.user_agent_file.read()
    args.user_agent_file.close()
    get_hub().NOT_ERROR += (KeyboardInterrupt,)
    http_server = WSGIServer((args.interface, args.port), app, spawn=Pool())
    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        pass
