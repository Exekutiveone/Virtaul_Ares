"""Definition of all available actions for the RL agent.

The first five entries are the basic driving commands. Following those we
generate camera actions that allow pointing the second camera at any angle
between -90 and 90 degrees (inclusive).  The individual actions are encoded as
``cam_<angle>`` where ``<angle>`` is an integer value.  This gives the agent a
discrete choice of 181 different camera positions which covers the full
rotation range in one degree steps.
"""

# Basic driving actions
ACTIONS = [
    "forward",
    "left",
    "right",
    "backward",
    "stop",
]

# Generate camera actions from -90 to 90 degrees
ACTIONS += [f"cam_{deg}" for deg in range(-90, 91)]

STATE_SIZE = 8
ACTION_SIZE = len(ACTIONS)
