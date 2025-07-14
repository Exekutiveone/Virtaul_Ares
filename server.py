
from flask import Flask, request, jsonify, render_template
from uuid import uuid4
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import json

app = Flask(__name__, static_folder='static', template_folder='templates')

# In-memory storage for maps and telemetry
maps = {}
control_action = None
telemetry_log = []


@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/maps')
def map_list():
    return render_template('index.html')


@app.route('/map2')
def map2_page():
    return render_template('map2.html')


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


@app.route('/api/maps', methods=['GET', 'POST'])
def maps_route():
    if request.method == 'POST':
        data = request.get_json(force=True)
        name = data.get('name', '')
        map_data = data.get('map')
        map_id = str(uuid4())
        maps[map_id] = {'id': map_id, 'name': name, 'map': map_data}
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
        name = request.get_json(force=True).get('name', maps[map_id]['name'])
        maps[map_id]['name'] = name
        return jsonify({'id': map_id, 'name': name})
    else:  # DELETE
        del maps[map_id]
        return '', 204

@app.route('/api/control', methods=['GET', 'POST'])
def control():
    global control_action
    if request.method == 'POST':
        control_action = request.get_json(force=True).get('action')
        return '', 204
    else:
        action = control_action
        control_action = None
        return jsonify({'action': action})

@app.route('/api/car', methods=['POST'])
def car():
    data = request.get_json(force=True)
    telemetry_log.append(data)
    return '', 204

if __name__ == '__main__':
    app.run(debug=True)

