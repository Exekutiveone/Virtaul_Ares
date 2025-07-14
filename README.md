# Virtual Ares

This repository contains a small browser based car simulator. The page `map2.html` loads several JavaScript modules from the `src` directory and renders a grid on which a car can drive. Obstacles and a target can be placed on the map and an autopilot can be used to find an optimal path to the target.

## Running the simulation

Run the Flask application which serves both the HTML interface and the API endpoints:

```bash
python server.py
```

Then open `http://127.0.0.1:5000/` in your browser. The Flask server exposes the following services:
- `http://127.0.0.1:5000/api/car` for telemetry data from the simulator.
- `http://127.0.0.1:5000/api/control` for remote control commands.
   Then navigate to `http://localhost:8000/map2.html`.

2. Start the Flask backend which provides the required API endpoints:

   ```bash
   python server.py
   ```

    This exposes the following services:
    - `http://127.0.0.1:5001/api/car` for telemetry data from the simulator.
    - `http://localhost:5002/api/control` for remote control commands.

Without these servers the related features of the HTML page will not work.

## Saving and loading maps

The control panel of `map2.html` contains buttons for working with maps. Maps
can be saved and loaded locally as JSON or CSV files. The previous server based
database for storing maps has been removed, so all map management now happens
through file download and upload only. When editing a map that was loaded from
the server's CSV list you can use the **CSV überschreiben** button to overwrite
the original file instead of downloading a new one.

## Command sequences

Sequences of actions can be stored under `static/sequences`. Each line of a
sequence normally consists of an action and a duration in seconds:

```
forward,1
left,0.5
```

It is also possible to use conditional statements based on the sensor values.
An example line looks like this:

```
if front < 50 then backward 1 else forward 1
```

The available sensor names are `front` (red LiDAR), `left`, `right` and `back`
(blue sonar). When running the sequence the condition is evaluated and the
corresponding branch is executed.
