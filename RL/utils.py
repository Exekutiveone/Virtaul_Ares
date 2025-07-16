# Available actions for the RL agent. Besides the basic driving commands
# three additional entries allow controlling the second camera. The camera
# can be pointed 45 degrees to the left or right or straight ahead.
ACTIONS = [
    "forward",
    "left",
    "right",
    "backward",
    "stop",
    "cam_left",
    "cam_center",
    "cam_right",
]
STATE_SIZE = 7
ACTION_SIZE = len(ACTIONS)
