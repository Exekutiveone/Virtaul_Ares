
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
    return render_template('index.html')


@app.route('/map2')
def map2_page():
    return render_template('map2.html')


# CSV map storage
CSV_MAPS_FOLDER = os.path.join(app.static_folder, 'maps')
CSV_LIST_FILE = os.path.join(CSV_MAPS_FOLDER, 'list.json')


def load_csv_map_list():
    if os.path.exists(CSV_LIST_FILE):
        with open(CSV_LIST_FILE) as f:
            return json.load(f)
    return []


def save_csv_map_list(data):
    with open(CSV_LIST_FILE, 'w') as f:
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

