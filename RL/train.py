"""Simple training loop for the reinforcement learning agent."""

import argparse
import os
import numpy as np

from config import BASE_URL, NUM_EPISODES, MAX_STEPS
from agent import DQNAgent
from logger import Logger
from utils import ACTIONS


def main() -> None:
    """Run the training loop."""
    parser = argparse.ArgumentParser(description="Train the DQN agent")
    parser.add_argument(
        "--env",
        choices=["v", "t"],
        default="v",
        help="use the virtual (v) or test (t) environment",
    )
    parser.add_argument(
        "--log",
        default=os.path.join(os.path.dirname(__file__), "rl_log.csv"),
        help="path to the training log",
    )
    args = parser.parse_args()

    if args.env == "t":
        from remote_env import RemoteEnv as Env

        env = Env()
    else:
        from environment import ServerEnv as Env

        env = Env(BASE_URL)

    agent = DQNAgent()
    logger = Logger(args.log)
    for ep in range(NUM_EPISODES):
        state = env.reset()
        total = 0.0
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


if __name__ == "__main__":
    main()
