# Virtual Ares

This repository contains a small browser based car simulator. The page `map2.html` loads several JavaScript modules from the `src` directory and renders a grid on which a car can drive. Obstacles and a target can be placed on the map.

## Running the simulation

Run the Flask application which serves both the HTML interface and the API
endpoints:

```bash
python server.py
```

Then open `http://127.0.0.1:5000/` in your browser. The server exposes the
following services:
- `http://127.0.0.1:5000/api/car` for reading or sending telemetry data.
- `http://127.0.0.1:5000/api/control` for remote control commands.
- `http://127.0.0.1:5000/api/grid` for the current occupancy grid.
The map editor is available at `http://127.0.0.1:5000/map2`. A simple view of the
API output can be found at `http://127.0.0.1:5000/status`.
Training progress of the RL agent can be monitored at
`http://127.0.0.1:5000/rl-progress`. The chart on this page now refreshes
automatically so you can watch rewards and epsilon values update during
training.

To start training run `python RL/train.py`. The script asks which
environment to use:

- `[V]`irtual – train directly against the browser based simulator.
- `[T]`est – use the headless environment from `TE/TE.py`.
- `[B]`oth – train in the test environment while mirroring the actions to
  the virtual simulator for visualisation.

### Saving the RL model

The training script automatically stores the neural network under
`RL/dqn_model.keras` after each episode. When you run `train.py` again, it will
load this file if present so training can continue from the previous state.

## Battery model

Each episode starts with a full battery. During simulation the battery level
decreases proportionally to the car's RPM and the elapsed time. The drain rate
was reduced so the battery lasts roughly four times longer. When the level
drops to 0&nbsp;% the vehicle can no longer move and the next map is loaded
automatically. The battery percentage is included in the RL state and if
depletion happens before the goal is achieved the agent receives an additional
penalty and the episode ends.

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
true (e.g. `while front > 20`). Sequences that contain such loops or other
conditional logic are stored in JSON format. When saving a sequence with loops,
the editor automatically selects JSON to avoid API errors.

Saved sequences can be reused inside new ones. When adding an "Ablauf einfügen"
block the editor stores only a reference to the selected sequence. During
execution the referenced file is loaded and its steps are executed. This allows
modularizing complex behaviours.

Existing sequences saved in JSON format can be loaded back into the editor
through the new **Vorhanden** drop-down and the **Laden** button. This makes it
possible to edit and extend previously created command sequences.

Sequences saved as CSV or ROS files can also be loaded. When imported, they are
converted into simple action lists so they can be further adjusted and saved
again, e.g. in JSON format for advanced features.
