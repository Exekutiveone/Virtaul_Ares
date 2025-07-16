import numpy as np
from config import BASE_URL, NUM_EPISODES, MAX_STEPS
from agent import DQNAgent
from logger import Logger
from pathlib import Path
from utils import ACTIONS, format_action

ENV_CHOICE = input(
    "Select environment - [V]irtual, [T]est or [B]oth: "
).strip().lower()
if ENV_CHOICE == "t":
    from remote_env import RemoteEnv as Env
    env = Env()
elif ENV_CHOICE == "b":
    from dual_env import DualEnv as Env
    env = Env()
else:
    from environment import ServerEnv as Env
    env = Env(BASE_URL)

MODEL_FILE = Path(__file__).with_name("dqn_model.keras")

if __name__ == '__main__':
    agent = DQNAgent(str(MODEL_FILE) if MODEL_FILE.exists() else None)
    log_path = Path(__file__).with_name("rl_log.csv")
    logger = Logger(str(log_path))
    for ep in range(NUM_EPISODES):
        state = env.reset()
        total = 0
        termination_reason = "Max. Schritte"
        for st in range(MAX_STEPS):
            a = agent.act(np.array(state))
            env.send_action(a)
            s2 = env.get_state()
            # Capture termination flags before they might be reset by
            # ``compute_reward`` so the reason can be reported accurately.
            # Values may be provided by the RemoteEnv HTTP API
            map_switched = getattr(env, "map_switched", getattr(env, "goal_reached", False))
            crashed = getattr(env, "crashed", False)
            coverage_done = getattr(env, "coverage_done", False)
            stalled = getattr(env, "stalled", False)
            battery = getattr(env, "battery", 1.0)
            r = env.compute_reward(state, s2)
            done = env.done
            agent.remember(state, a, r, s2, done)
            logger.log(ep, st, format_action(ACTIONS[a]), state, r, done, agent.epsilon)
            state = s2
            total += r
            if done:
                if battery <= 0:
                    termination_reason = "Batterie leer"
                elif map_switched:
                    termination_reason = "Ziel erreicht"
                elif crashed:
                    termination_reason = "Crash"
                elif coverage_done:
                    termination_reason = "95% Abdeckung"
                elif stalled:
                    termination_reason = "Stall"
                else:
                    termination_reason = "Unbekannt"
                break
        # Restart the map after early termination so the next episode begins
        # with a clean SLAM map and full battery.  Only keep the current map
        # when coverage finished the episode.
        if termination_reason != "95% Abdeckung":
            try:
                env.reset()
            except Exception:
                pass
        agent.replay()
        logger.flush()
        agent.save(str(MODEL_FILE))
        map_name = getattr(env, "get_map_name", lambda: "unknown")()
        print(
            f"Episode {ep} finished after {st + 1} steps with reward {total:.2f} "
            f"on map {map_name} ({termination_reason})"
        )
    logger.close()