# Virtual Ares

This repository contains a small browser based car simulator. The page `map2.html` loads several JavaScript modules from the `src` directory and renders a grid on which a car can drive. Obstacles and a target can be placed on the map and an autopilot can be used to find an optimal path to the target.

## Running the simulation

1. Serve the files via a local HTTP server and open `map2.html` in a modern browser, for example:

   ```bash
   python -m http.server
   ```

   Then navigate to `http://localhost:8000/map2.html`.

2. Start the Flask backend which provides the required API endpoints:

   ```bash
   python server.py
   ```

   This exposes the following services:
   - `http://127.0.0.1:5000/api/maps` for storing and retrieving maps.
   - `http://127.0.0.1:5001/api/car` for telemetry data from the simulator.
   - `http://localhost:5002/api/control` for remote control commands.

Without these servers the related features of the HTML page will not work.

## Saving and loading maps

The control panel of `map2.html` contains buttons for working with maps. Maps can be downloaded as a JSON file ("Save Map" / "Load Map") or saved to the map API ("Save Map" and "Karte laden"). Use "Fetch Maps" to list all maps stored on the server. They can then be renamed or deleted using the respective buttons.
