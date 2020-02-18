"""Coventry Samaritans Wall Board."""

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

import updater

# We can ignore multiple rota IDs, so we're not showing stuff to people who
# don't care about it.
ignored_rota_ids = [
    403,  # On holiday
    2381,  # Ofice PC Booking
    1496,  # Rye Hill Debrief
    720,  # Onley Debrief
]

# The rota IDs listed below will be shown in the "special rota section". This
# means above the previous, current and next shifts.
special_rota_ids = [
    156,  # Duty Deputy
]

# This format is used when showing shift times. It means hour:minute.
time_format = '%H:%M'

# URLs:
base_url = 'https://www.3r.org.uk/'
directory_url = base_url + 'directory'
volunteer_url = base_url + 'directory/%d?format=json'
shift_url = base_url + 'shift.json'

# This regexp is used for getting Sams numbers from names. I used to use
# volunteer IDs, but if a person had been a part of the branch longer than
# they'd been a listening volunteer, they ended further up the board than they
# should be (thanks Claire-Louise 802).
volunteer_number_regexp = re.compile('^[^0-9]+([0-9]+)$')

http = Session()
app = Flask(__name__)

# Ensure templates get reloaded if the files change.
app.config['TEMPLATES_AUTO_RELOAD'] = True

# The 3 rings API key. Get it from your rota URL, with /api appended.
app.config['3R_APIKEY'] = None


def get_url(url, auth=True, json=False):
    """Get a URL, returning abort or the content retrieved from the URL."""
    # The 3r API asks us to use a user agent which identifies us. You can
    # change it in the user-agent.txt file.
    headers = {'user-agent': app.config['USER_AGENT']}
    if auth:
        # Add the Authorization header.
        headers['Authorization'] = f'APIKEY {app.config["3R_APIKEY"]}'
    r = http.get(url, headers=headers)
    if r.ok:
        # The get succeeded.
        if json:
            return r.json()
        # else: Return plain text.
        return r.content
    # Get failed.
    return abort(r.status_code)


@app.route('/')
def index():
    """Return the index page."""
    return render_template('index.html', debug=app.config['DEBUG'])


@app.route('/directory/')
def directory():
    """Get the volunteers, and return them as a list of dictionaries. Use the
    HTML-based directory, since the json version doesn't seem to show whether
    or not a volunteer is on leave."""
    s = BeautifulSoup(get_url(directory_url), 'html.parser')
    results = []  # The results which will be returned.
    # Get a list of "td" elements.
    tds = s.find_all(
        'td', attrs={'class': 'directory_list_property_friendly_name'}
    )
    for td in tds:
        a = td.find('a')  # The link to the volunteer in the rota.
        name = a.text
        d = {'name': name}
        # Use regexp to get a volunteer's Samaritans number. Used later on for
        # sorting the list.
        m = volunteer_number_regexp.match(name)
        if m is None:  # Names like RotaOnly and Test.
            d['number'] = 0
        else:
            d['number'] = int(m.groups()[0])
        # Let's get the real volunteer number.
        href = a.get('href')
        # Extract the real volunteer ID from href.
        d['id'] = int(href.split('/')[-1])
        # Now work out if they're on leave or not.
        d['on_leave'] = bool(td.find('img', attrs={'alt': 'On leave'}))
        # Finally, append to the results list.
        results.append(d)
    # Sort the results by Samaritans number.
    results = sorted(results, key=lambda v: v['number'])
    return jsonify(results)


# Cache images to reduce the requests to 3r.
images = {}


@app.route('/thumb/<int:id>')
def thumb(id):
    """Get a volunteer thumbnail by volunteer ID."""
    if id not in images:
        # We must load it from 3r.
        images[id] = get_url(f'{base_url}directory/{id}/photos/thumb.jpg',)
    # Return it from the dictionary.
    return images[id]


@app.route('/email/')
def email():
    """Get email stats."""
    s = BeautifulSoup(get_url('http://www.ear-mail.org.uk/', auth=False), 'html.parser')
    # Get the table that's inside another table, with no useful ID or
    # classes... This code is fragile!!
    table = s.find_all('table')[2]
    # Get a list of strings from a list of "td" elements.
    tds = [td.text for td in table.find_all('td')]
    unanswered = tds[4]
    oldest = tds[5]
    # Convert unanswered to an integer, because JavaScript will be checking it
    # to colour the output.
    unanswered = int(unanswered)
    # Let's get rid of the date, and just send along the duration as
    # hours:minutes.
    oldest = oldest.split('(')[1].strip(')')
    return jsonify(dict(unanswered=unanswered, oldest=oldest))


@app.route('/shifts/')
def shifts():
    """Get the most recent bundle of shifts, all shifts currently running (if
    any), and the oldest future shifts."""
    current_shifts = {}  # Those running now.
    past_shifts = {}  # Those that have most recently finished.
    future_shifts = {}  # Those that are about to start.
    now = datetime.now()  # Let's remember where we are in time.
    # Let's store the date component. We'll use it for getting the right shifts
    # from 3r, and comparison later on.
    now_date = now.date()
    tomorrow = now + timedelta(days=1)
    # Stored for the same reasons as now_date.
    tomorrow_date = tomorrow.date()
    yesterday = now - timedelta(days=1)
    # Remember yesterday so we can start searching for shifts there. In case
    # this board is being looked at in the middle of the night.
    yesterday_date = yesterday.date()
    # Construct a GET component.
    e = urlencode(dict(start_date=yesterday_date, end_date=tomorrow_date))
    # Get a bunch of shifts in JSON format. DEAD SLOWLY!
    shifts = get_url(shift_url + '?' + e, json=True)['shifts']
    # We'll send this list later on.
    results = []
    # Cache volunteers. Probably largely a waste of time, but it trims down
    # requests to 3r, and quite often day leaders do multiple shifts back to
    # back.
    volunteers = {}
    # These dates will shift as we run through the shifts we've gathered.
    past_shift_latest = yesterday
    future_shift_earliest = tomorrow
    for shift in shifts:
        rid = shift['rota']['id']
        # Let's parse the textual date 3r sends.
        start = parse_date(shift['start_datetime'])
        # Let's now convert that object into something really useful.
        start = datetime(
            start.year, start.month, start.day, start.hour, start.minute
        )
        # And work out when it ends.
        end = start + timedelta(seconds=shift['duration'])
        shift_end_date = end.date()
        if rid in ignored_rota_ids or shift_end_date < now_date:
            # Don't bother with shifts that should be ignored, or those that
            # ended yesterday. That second part may cause problems in the
            # future, but it looks OK for now.
            continue
        # Store start and end for later.
        shift['start'] = start
        shift['end'] = end
        # All shifts will be put into the right dictionary, depending on their
        # place in time, and the times we created earlier will get modified
        # accordingly.
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
    # Let's clear the old list. We have a new one to play with.
    shifts.clear()
    # Like Hitler says: Get the old ones first!
    for passed in past_shifts.values():
        # Just the most recent one.
        shift = passed[-1]
        if shift['start'] == past_shift_latest:  # It's the newest.
            shifts.append(shift)
    # Now the ones that are running. Use all of them.
    for current in current_shifts.values():
        shifts.extend(current)
    # Now the ones that haven't started yet. We only want the earliest of
    # those.
    for future in future_shifts.values():
        shift = future[0]
        if shift['start'] == future_shift_earliest:  # It's the earliest.
            shifts.append(shift)
    # Now the real convertion to something we can send back to the client
    # begins.
    for shift in shifts:
        rid = shift['rota']['id']
        # We get the special rotas now, because if we did it earlier, we'd end
        # up with all of them in a given day, or have to do extra sorting.
        if rid in special_rota_ids:  # Will appear above the others.
            shift_type = 'special'
        else:  # Just a run-of-the-mill shift.
            shift_type = shift['type']
        # The start and end items are still in datetime format because we
        # stored them earlier.
        start = shift['start']
        end = shift['end']
        rota_name = shift['rota']['name']
        start_string = start.strftime(time_format)  # Like 09:00.
        end_string = end.strftime(time_format)  # Like 13:00.
        if start == end:  # Probably different days though.
            time = 'All day'
        else:
            time = f'{start_string}-{end_string}'
        name = rota_name
        if shift['title']:
            name = f'{name} - {shift["title"]}'
        # Most of this tomorrow and yesterday stuff isn't really used now, but
        # for the extra millisecond it probably takes to process, I reckon it
        # can stay.
        start_date = start.date()
        if start_date == tomorrow_date:
            prefix = "Tomorrow's "
        elif start_date == yesterday_date:
            prefix = "Yesterday's "
        else:
            prefix = ''
        name = f'{prefix} {name}'
        # Create most of the dictionary the client will see.
        d = dict(name=name, type=shift_type, time=time, volunteers=[], id=rid)
        # Go through the list of volunteers that have signed up for this duty.
        # The ones we're about to traverse just have an ID and a name. We want
        # their phone numbers for display.
        for signup in shift['volunteer_shifts']:
            volunteer = signup['volunteer']
            id = volunteer['id']
            if id not in volunteers:
                # We need to cache them.
                volunteers[id] = get_url(
                    volunteer_url % id, json=True
                )['volunteer']
            # Get the latest and greatest copy!
            volunteer = volunteers[id]
            # The below list contains phone numbers and email addresses and
            # stuff.
            props = volunteer['volunteer_properties']
            volunteer['details'] = []  # Create a handy list to store them.
            for prop in props:
                # The code entry contains a machine-friendly code like
                # email_address.
                code = prop['code']
                name = prop['name']  # A human-readable name.
                value = prop['value']  # The value... Obviously.
                # Now we use the cool code we stored earlier.
                if code.startswith('telephone'):  # We want it!
                    volunteer['details'].append(
                        dict(name='T', value=value)
                    )
                elif name == 'Friendly Name':  # Maybe a preferred name.
                    volunteer['name'] = value
                else:
                    continue  # Ignore all other properties.
            d['volunteers'].append(
                dict(
                    name=volunteer['name'], id=id,
                    details=volunteer['details']
                )
            )
        # Append that massive dictionary we just made.
        results.append(d)
    return jsonify(results)


@app.route('/version/')
def version():
    """Used so the client knows when to reload. Uses the last modified
    timestamp of index.html."""
    return jsonify(
        os.path.getmtime(
            os.path.join(app.jinja_loader.searchpath[0], 'index.html')
        )
    )


@app.route('/news/')
def news():
    """Get the news from 3r."""
    return jsonify(get_url(base_url + 'news.json', json=True)['news_items'])


# Command line arguments.
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


def editor(filename):
    """Return the static file editor."""
    # Get a full path to the filename we were given.
    path = os.path.join('static', filename)
    if not os.path.isfile(path):
        # They entered an incorrect path.
        return abort(404, 'No such file: %s.' % path)
    if request.method == 'POST':
        # They've uploaded some code. Much gladness!
        # Get the code from POST data.
        code = request.form['code']
        # We need to replace "\r\n" (windows) with "\n" (generic), to make sure
        # there's not massive gaps in the file.
        code = code.replace('\r\n', '\n')
        # Let's write the file.
        with open(path, 'w') as f:
            f.write(code)
        # Now let's modify index.html. This is done in two stages:
        # 1: Read the file and modify the string in memory.
        # 2: Write the string back to the file.
        updater.file_updated(app, path)
        # Now redirect them back to the GET page, because hitting refresh and
        # being told the page relied on form data you previously entered is
        # annoying. There are unacceptable levels of unrest, after all!
        return redirect(url_for('editor', filename=filename))
    # Now the GET part.
    # First get the code.
    with open(path, 'r') as f:
        code = f.read()
    # Now render the template.
    return render_template(
        'editor.html', filename=filename, contents=code, path=path
    )


if __name__ == '__main__':
    # Parse command line arguments.
    args = parser.parse_args()
    if args.allow_edits:  # Warn.
        app.logger.warning('Editor enabled!!!')
        # Now add the URL route.
        app.route('/edit/<filename>', methods=['GET', 'POST'])(editor)
    app.config['DEBUG'] = args.debug
    app.config['3R_APIKEY'] = args.api_key_file.read()
    args.api_key_file.close()
    app.config['USER_AGENT'] = args.user_agent_file.read()
    args.user_agent_file.close()
    # Let's stop KeyboardInterrupt from being shown when we hit control c.
    get_hub().NOT_ERROR += (KeyboardInterrupt,)
    # Let's make an HTTP server.
    http_server = WSGIServer((args.interface, args.port), app, spawn=Pool())
    try:
        http_server.serve_forever()  # Watch that baby go!
    except KeyboardInterrupt:
        pass  # Quit silently.
