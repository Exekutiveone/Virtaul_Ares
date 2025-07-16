"""Definition of all available actions for the RL agent.

Actions consist of a combination of a driving command and a camera angle. This
allows the agent to move the car while adjusting the viewing direction within a
single step.  The driving component supports the basic motion commands while
the camera angle can be set anywhere between -90 and 90 degrees (inclusive).
"""

# Basic driving commands
DRIVE_ACTIONS = [
    "forward",
    "left",
    "right",
    "backward",
    "stop",
]

# Camera angles from -90 to 90 degrees in one degree steps
CAMERA_ANGLES = list(range(-90, 91))

# Create the full action space as the Cartesian product of driving commands and
# camera orientations.  Each entry is a tuple ``(drive_cmd, angle)``.
ACTIONS = [
    (d, a) for d in DRIVE_ACTIONS for a in CAMERA_ANGLES
]

STATE_SIZE = 8
ACTION_SIZE = len(ACTIONS)


def format_action(action):
    """Return a readable representation of an action tuple."""
    drive, angle = action
    return f"{drive}|cam_{angle}"
