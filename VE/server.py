
from flask import Flask, request, jsonify, render_template
import csv
from uuid import uuid4
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import json
import math

app = Flask(__name__, static_folder='static', template_folder='templates')

# In-memory storage for maps and telemetry
maps = {}
control_action = None
control_value = None
telemetry_log = []
latest_telemetry = None
current_map = None
current_grid = None
current_slam_map = None
goal_reached = False
waypoint_reached = False

RL_LOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'RL', 'rl_log.csv'))


@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/maps')
def map_list():
    return render_template('index.html')


@app.route('/map2')
def map2_page():
    return render_template('map2.html')


@app.route('/status')
def status_page():
    return render_template('status.html')


@app.route('/rl-progress')
def rl_progress_page():
    return render_template('rl_progress.html')


# CSV map storage
CSV_MAPS_FOLDER = os.path.join(app.static_folder, 'maps')
CSV_LIST_FILE = os.path.join(CSV_MAPS_FOLDER, 'list.json')

# Sequence storage
SEQUENCE_FOLDER = os.path.join(app.static_folder, 'sequences')
SEQUENCE_LIST_FILE = os.path.join(SEQUENCE_FOLDER, 'list.json')


def load_csv_map_list():
    if os.path.exists(CSV_LIST_FILE):
        with open(CSV_LIST_FILE) as f:
            return json.load(f)
    return []


def save_csv_map_list(data):
    with open(CSV_LIST_FILE, 'w') as f:
        json.dump(data, f)

def load_seq_list():
    if os.path.exists(SEQUENCE_LIST_FILE):
        with open(SEQUENCE_LIST_FILE) as f:
            return json.load(f)
    return []

def save_seq_list(data):
    os.makedirs(SEQUENCE_FOLDER, exist_ok=True)
    with open(SEQUENCE_LIST_FILE, 'w') as f:
        json.dump(data, f)


def map_to_grid(map_data):
    cols = map_data.get('cols')
    rows = map_data.get('rows')
    cell = map_data.get('cellSize', 1)
    grid = [[1 for _ in range(cols)] for _ in range(rows)]
    for o in map_data.get('obstacles', []):
        start_x = int(o.get('x', 0) / cell)
        start_y = int(o.get('y', 0) / cell)
        size = max(1, int(o.get('size', cell) / cell))
        for dx in range(size):
            for dy in range(size):
                x = start_x + dx
                y = start_y + dy
                if 0 <= x < cols and 0 <= y < rows:
                    grid[y][x] = 2
    return grid


def grid_to_geo(map_data, origin_lat=50.0, origin_lon=8.0, cm_per_px=2):
    """Convert a map description into geographic coordinates.

    Parameters
    ----------
    map_data: dict
        Map information containing cols, rows and cellSize.
    origin_lat: float
        Latitude of the grid origin (south-west corner).
    origin_lon: float
        Longitude of the grid origin (south-west corner).
    cm_per_px: float
        Real world centimeters represented by one pixel.

    Returns
    -------
    dict
        Structure with origin and a matrix of latitude/longitude pairs.
    """
    cols = map_data.get('cols', 0)
    rows = map_data.get('rows', 0)
    cell_px = map_data.get('cellSize', 1)
    cell_m = cell_px * cm_per_px / 100.0
    coords = []
    for r in range(rows):
        row = []
        for c in range(cols):
            lat = origin_lat + (r * cell_m / 111320)
            lon = origin_lon + (
                c * cell_m / (111320 * math.cos(math.radians(origin_lat)))
            )
            row.append({'lat': lat, 'lon': lon})
        coords.append(row)
    return {'origin': {'lat': origin_lat, 'lon': origin_lon}, 'cells': coords}


@app.route('/api/csv-maps', methods=['GET', 'POST'])
def csv_maps():
    if request.method == 'POST':
        data = request.get_json(force=True)
        name = data.get('name')
        csv_data = data.get('csv')
        creator = data.get('creator', 'Unknown')
        if not name or not csv_data:
            return jsonify({'error': 'missing name or csv'}), 400
        filename = secure_filename(name)
        if not filename.endswith('.csv'):
            filename += '.csv'
        os.makedirs(CSV_MAPS_FOLDER, exist_ok=True)
        with open(os.path.join(CSV_MAPS_FOLDER, filename), 'w') as f:
            f.write(csv_data)
        maps_list = load_csv_map_list()
        maps_list.append({
            'file': filename,
            'name': name,
            'created': datetime.utcnow().isoformat(),
            'creator': creator,
        })
        save_csv_map_list(maps_list)
        return jsonify({'file': filename}), 201
    else:
        maps_list = load_csv_map_list()
        return jsonify(maps_list)


@app.route('/sequence')
def sequence_page():
    return render_template('sequence.html')


@app.route('/sequences')
def sequence_list_page():
    return render_template('sequences.html')


@app.route('/api/sequences', methods=['GET', 'POST'])
def sequences_api():
    if request.method == 'POST':
        data = request.get_json(force=True)
        name = data.get('name')
        steps = data.get('steps')
        fmt = data.get('format', 'csv')
        if not name or not steps:
            return jsonify({'error': 'missing name or steps'}), 400
        filename = secure_filename(name)
        if fmt == 'ros':
            if not filename.endswith('.ros'):
                filename += '.ros'
        elif fmt == 'json':
            if not filename.endswith('.json'):
                filename += '.json'
        else:
            if not filename.endswith('.csv'):
                filename += '.csv'
        os.makedirs(SEQUENCE_FOLDER, exist_ok=True)
        path = os.path.join(SEQUENCE_FOLDER, filename)
        if fmt == 'json':
            with open(path, 'w') as f:
                json.dump(steps, f)
        else:
            if any(hasattr(s, 'get') and (
                'loop' in s or 'while' in s or 'if' in s or 'call' in s)
                for s in steps):
                return jsonify({'error': 'Loops and conditions require JSON format'}), 400
            lines = []
            for s in steps:
                if not isinstance(s, dict):
                    continue
                if 'line' in s:
                    lines.append(s['line'])
                elif 'repeat' in s and 'action' in s and 'duration' in s:
                    lines.append(f"for {s['repeat']} {s['action']} {s['duration']}")
                elif 'action' in s and 'duration' in s:
                    if fmt == 'ros':
                        lines.append(f"{s['action']} {s['duration']}")
                    else:
                        lines.append(f"{s['action']},{s['duration']}")
                else:
                    return jsonify({'error': 'Invalid step format'}), 400
            with open(path, 'w') as f:
                f.write("\n".join(lines))
        lst = load_seq_list()
        lst.append({'file': filename, 'name': name, 'created': datetime.utcnow().isoformat(), 'format': fmt})
        save_seq_list(lst)
        return jsonify({'file': filename}), 201
    else:
        return jsonify(load_seq_list())


@app.route('/api/sequences/<filename>', methods=['PUT', 'DELETE'])
def update_sequence(filename):
    secure_name = secure_filename(filename)
    path = os.path.join(SEQUENCE_FOLDER, secure_name)

    if request.method == 'DELETE':
        if os.path.exists(path):
            os.remove(path)
        seq_list = load_seq_list()
        seq_list = [s for s in seq_list if s['file'] != secure_name]
        save_seq_list(seq_list)
        return '', 204

    if not os.path.exists(path):
        return jsonify({'error': 'not found'}), 404

    data = request.get_json(force=True)
    new_name = data.get('name')
    if not new_name:
        return jsonify({'error': 'missing name'}), 400
    base, ext = os.path.splitext(secure_name)
    new_file = secure_filename(new_name)
    if not new_file.endswith(ext):
        new_file += ext
    new_path = os.path.join(SEQUENCE_FOLDER, new_file)
    os.rename(path, new_path)
    seq_list = load_seq_list()
    for entry in seq_list:
        if entry['file'] == secure_name:
            entry['file'] = new_file
            entry['name'] = new_name
            entry['created'] = datetime.utcnow().isoformat()
            break
    save_seq_list(seq_list)
    return jsonify({'file': new_file}), 200


@app.route('/api/csv-maps/<filename>', methods=['PUT', 'DELETE'])
def update_csv_map(filename):
    secure_name = secure_filename(filename)
    path = os.path.join(CSV_MAPS_FOLDER, secure_name)

    if request.method == 'DELETE':
        if os.path.exists(path):
            os.remove(path)
        maps_list = load_csv_map_list()
        maps_list = [m for m in maps_list if m['file'] != secure_name]
        save_csv_map_list(maps_list)
        return '', 204

    if not os.path.exists(path):
        return jsonify({'error': 'not found'}), 404

    data = request.get_json(force=True)
    new_name = data.get('name')
    csv_data = data.get('csv')

    if new_name and not csv_data:
        base, ext = os.path.splitext(secure_name)
        new_file = secure_filename(new_name)
        if not new_file.endswith('.csv'):
            new_file += '.csv'
        new_path = os.path.join(CSV_MAPS_FOLDER, new_file)
        os.rename(path, new_path)
        maps_list = load_csv_map_list()
        for entry in maps_list:
            if entry['file'] == secure_name:
                entry['file'] = new_file
                entry['name'] = new_name
                entry['created'] = datetime.utcnow().isoformat()
                break
        save_csv_map_list(maps_list)
        return jsonify({'file': new_file}), 200

    if csv_data is None:
        return jsonify({'error': 'missing csv'}), 400

    with open(path, 'w') as f:
        f.write(csv_data)
    maps_list = load_csv_map_list()
    for entry in maps_list:
        if entry['file'] == secure_name:
            entry['created'] = datetime.utcnow().isoformat()
            break
    save_csv_map_list(maps_list)
    return '', 204


@app.route('/api/csv-maps/order', methods=['PUT'])
def reorder_csv_maps():
    data = request.get_json(force=True)
    order = data.get('order')
    if not isinstance(order, list):
        return jsonify({'error': 'invalid order'}), 400
    maps_list = load_csv_map_list()
    file_to_entry = {m['file']: m for m in maps_list}
    new_list = [file_to_entry[f] for f in order if f in file_to_entry]
    for m in maps_list:
        if m['file'] not in order:
            new_list.append(m)
    save_csv_map_list(new_list)
    return '', 204


@app.route('/api/maps', methods=['GET', 'POST'])
def maps_route():
    if request.method == 'POST':
        data = request.get_json(force=True)
        name = data.get('name', '')
        map_data = data.get('map')
        map_id = str(uuid4())
        maps[map_id] = {'id': map_id, 'name': name, 'map': map_data}
        global current_map, current_grid
        current_map = map_data
        if map_data:
            current_grid = map_to_grid(map_data)
        return jsonify({'id': map_id, 'name': name}), 201
    else:
        result = [{'id': m['id'], 'name': m['name']} for m in maps.values()]
        return jsonify(result)

@app.route('/api/maps/<map_id>', methods=['GET', 'PUT', 'DELETE'])
def map_detail(map_id):
    if map_id not in maps:
        return jsonify({'error': 'not found'}), 404
    if request.method == 'GET':
        return jsonify(maps[map_id]['map'])
    elif request.method == 'PUT':
        data = request.get_json(force=True)
        name = data.get('name', maps[map_id]['name'])
        maps[map_id]['name'] = name
        global current_map, current_grid
        if 'map' in data:
            maps[map_id]['map'] = data['map']
            current_map = data['map']
            current_grid = map_to_grid(current_map)
        return jsonify({'id': map_id, 'name': name})
    else:  # DELETE
        del maps[map_id]
        return '', 204

@app.route('/api/control', methods=['GET', 'POST'])
def control():
    global control_action, control_value
    if request.method == 'POST':
        data = request.get_json(force=True)
        control_action = data.get('action')
        control_value = data.get('value')
        return '', 204
    else:
        action = control_action
        value = control_value
        control_action = None
        control_value = None
        if value is None:
            return jsonify({'action': action})
        return jsonify({'action': action, 'value': value})

@app.route('/api/car', methods=['GET', 'POST'])
def car():
    global latest_telemetry
    if request.method == 'POST':
        data = request.get_json(force=True)
        telemetry_log.append(data)
        latest_telemetry = data
        return '', 204
    else:
        return jsonify(latest_telemetry or {})


@app.route('/api/goal', methods=['GET', 'POST'])
def goal():
    """Flag indicating that the current map's target was reached."""
    global goal_reached
    if request.method == 'POST':
        goal_reached = True
        return '', 204
    reached = goal_reached
    goal_reached = False
    return jsonify({'reached': reached})


@app.route('/api/waypoint', methods=['GET', 'POST'])
def waypoint():
    """Flag indicating that a waypoint was reached."""
    global waypoint_reached
    if request.method == 'POST':
        waypoint_reached = True
        return '', 204
    reached = waypoint_reached
    waypoint_reached = False
    return jsonify({'reached': reached})


@app.route('/api/grid')
def grid():
    if current_grid is None:
        return jsonify({'error': 'no map'}), 404
    return jsonify(current_grid)


@app.route('/api/grid-geo')
def grid_geo():
    if current_map is None:
        return jsonify({'error': 'no map'}), 404
    origin_lat = float(request.args.get('lat', 50.0))
    origin_lon = float(request.args.get('lon', 8.0))
    geo = grid_to_geo(current_map, origin_lat, origin_lon)
    return jsonify(geo)


@app.route('/api/slam-map')
def slam_map():
    if current_slam_map is None:
        # default simple map: return current_grid if available
        if current_grid is None:
            return jsonify({'gridSize': {'width': 0, 'height': 0}, 'cells': []})
        else:
            h = len(current_grid)
            w = len(current_grid[0]) if h else 0
            return jsonify({'gridSize': {'width': w, 'height': h}, 'cells': current_grid})
    h = len(current_slam_map)
    w = len(current_slam_map[0]) if h else 0
    return jsonify({'gridSize': {'width': w, 'height': h}, 'cells': current_slam_map})


@app.route('/api/rl-log')
def rl_log():
    if not os.path.exists(RL_LOG_PATH):
        return jsonify([])
    data = {}
    with open(RL_LOG_PATH, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ep = int(row['episode'])
            rew = float(row['reward'])
            eps = float(row['epsilon'])
            if ep not in data:
                data[ep] = {'reward': 0.0, 'epsilon': eps}
            data[ep]['reward'] += rew
            data[ep]['epsilon'] = eps
    result = [
        {'episode': ep, 'reward': vals['reward'], 'epsilon': vals['epsilon']}
        for ep, vals in sorted(data.items())
    ]
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)

