import numpy as np
from config import BASE_URL, NUM_EPISODES, MAX_STEPS
from agent import DQNAgent
from logger import Logger
from pathlib import Path
from utils import ACTIONS

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
        for st in range(MAX_STEPS):
            a = agent.act(np.array(state))
            env.send_action(a)
            s2 = env.get_state()
            r = env.compute_reward(state, s2)
            done = env.done
            agent.remember(state, a, r, s2, done)
            logger.log(ep, st, ACTIONS[a], state, r, done, agent.epsilon)
            state = s2
            total += r
            if done:
                break
        agent.replay()
        logger.flush()
        agent.save(str(MODEL_FILE))
        print(f"Episode {ep} finished after {st + 1} steps with reward {total:.2f}")
    logger.close()
