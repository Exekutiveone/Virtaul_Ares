# Virtual Ares

This repository contains a small browser based car simulator. The page `map2.html` loads several JavaScript modules from the `src` directory and renders a grid on which a car can drive. Obstacles and a target can be placed on the map and an autopilot can be used to find an optimal path to the target.

## Running the simulation

Run the Flask application which serves both the HTML interface and the API endpoints:

```bash
python server.py
```

Then open `http://127.0.0.1:5000/` in your browser. The Flask server exposes the following services:
- `http://127.0.0.1:5000/api/maps` for storing and retrieving maps.
- `http://127.0.0.1:5000/api/car` for telemetry data from the simulator.
- `http://127.0.0.1:5000/api/control` for remote control commands.

## Saving and loading maps

The control panel of `map2.html` contains buttons for working with maps. Maps can be downloaded as a JSON file ("Save Map" / "Load Map") or saved to the map API ("Save Map" and "Karte laden"). Use "Fetch Maps" to list all maps stored on the server. They can then be renamed or deleted using the respective buttons.
