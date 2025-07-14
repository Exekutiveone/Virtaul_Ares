# Virtual Ares

This repository contains a small browser based car simulator. The page `map2.html` loads several JavaScript modules from the `src` directory and renders a grid on which a car can drive. Obstacles and a target can be placed on the map and an autopilot can be used to find an optimal path to the target.

## Running the simulation

Run the Flask application which serves both the HTML interface and the API
endpoints:

```bash
python server.py
```

Then open `http://127.0.0.1:5000/` in your browser. The server exposes the
following services:
- `http://127.0.0.1:5000/api/car` for telemetry data from the simulator.
- `http://127.0.0.1:5000/api/control` for remote control commands.
The map editor is available at `http://127.0.0.1:5000/map2`.

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

You can create such conditional sequences directly in the dashboard under
`/sequence`. Besides the normal **Schritt hinzufügen** button there is now a
**Bedingung hinzufügen** option which lets you pick a sensor, comparison and the
actions for the *then* and *else* branches.

You can also repeat actions multiple times using a simple `for` statement:

```
for 3 forward 1
```

This executes the `forward` command three times for one second each. In the
sequence editor this can be added via the **Wiederholung hinzufügen** button.

Steps can be rearranged and nested via drag & drop. Simply drag an action or
condition onto the desired target list, e.g. into the *then* or *else* block or
inside a loop. Empty lists are shown with a dashed border to indicate that you
can drop items there.

The editor also supports **while** loops with sensor conditions. A loop will
continue executing its inner steps as long as the defined sensor comparison is
true (e.g. `while front > 20`).

Saved sequences can be reused inside new ones. When adding an "Ablauf einfügen"
block the editor stores only a reference to the selected sequence. During
execution the referenced file is loaded and its steps are executed. This allows
modularizing complex behaviours.
