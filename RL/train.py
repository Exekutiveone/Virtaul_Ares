import numpy as np
from config import BASE_URL, NUM_EPISODES, MAX_STEPS
from agent import DQNAgent
from logger import Logger
from utils import ACTIONS

ENV_CHOICE = input("Select environment - [V]irtual or [T]est: ").strip().lower()
if ENV_CHOICE == "t":
    from TE import SimEnv as Env
    env = Env()
else:
    from environment import ServerEnv as Env
    env = Env(BASE_URL)

if __name__ == '__main__':
    agent = DQNAgent()
    logger = Logger("rl_log.csv")
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
    logger.close()
