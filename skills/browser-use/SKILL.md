---
name: browser-use
description: Use when a task requires intelligent browser automation with natural language goals — scraping dynamic websites, filling forms, navigating multi-step flows, extracting data from pages that require interaction, or any web task where the steps aren't fully predictable. More powerful than playwright for complex tasks because the AI decides the steps. Use playwright skill instead for simple, well-defined automation.
---

# Browser-Use Skill

browser-use lets an AI agent control a real browser using natural language goals. It uses Playwright under the hood but adds LLM reasoning on top.

## Setup

```python
from langchain_anthropic import ChatAnthropic
from browser_use import Agent
import asyncio
import os

llm = ChatAnthropic(
    model="claude-sonnet-4-6",
    api_key=os.environ["ANTHROPIC_API_KEY"]
)
```

## Basic usage

```python
async def run():
    agent = Agent(
        task="Your task in plain English",
        llm=llm,
    )
    result = await agent.run()
    print(result)

asyncio.run(run())
```

## API Keys
- Anthropic: set `ANTHROPIC_API_KEY` environment variable
- OpenAI: set `OPENAI_API_KEY` environment variable

## Tips
- Tasks should be specific: "Go to kbdfans.com, find the Tofu65 2.0 in white, return the price and stock status"
- For scraping, add: "Extract and return as JSON"
- For login-required sites: provide credentials in the task description
- Use `max_steps=20` to limit runaway agents

## Example — check product availability

```python
agent = Agent(
    task="Go to kbdfans.com/products/tofu65-2-0, check if white color is in stock and return the price",
    llm=llm,
    max_steps=10,
)
```

## Dependencies

```bash
pip install browser-use langchain-anthropic
playwright install
```
