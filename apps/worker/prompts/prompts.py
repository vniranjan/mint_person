"""
YAML prompt loader with Jinja2 templating.
Full implementation → Story 3.1

Architecture:
- Prompts stored as YAML files in apps/worker/prompts/
- Jinja2 templating allows dynamic injection of: transaction list, user correction log
- Change model behavior → edit YAML files, restart worker — zero code changes required
"""
import logging
from pathlib import Path
from typing import Any

import yaml
from jinja2.sandbox import SandboxedEnvironment

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent


def load_prompt(template_name: str, context: dict[str, Any] | None = None) -> str:
    """
    Load a YAML prompt template and render it with Jinja2.

    Args:
        template_name: Filename without extension (e.g., "categorize_system")
        context: Variables to inject into the Jinja2 template

    Returns:
        Rendered prompt string ready for LLM API call

    Raises:
        FileNotFoundError: If template file doesn't exist
        yaml.YAMLError: If template YAML is invalid
    """
    context = context or {}  # Fix #10: avoid mutable default argument

    template_path = PROMPTS_DIR / f"{template_name}.yaml"
    if not template_path.exists():
        raise FileNotFoundError(f"Prompt template not found: {template_path}")

    with open(template_path) as f:
        raw = yaml.safe_load(f)

    prompt_text = raw.get("prompt", "")

    # SandboxedEnvironment prevents SSTI from user-supplied merchant names (Fix #7)
    env = SandboxedEnvironment()
    template = env.from_string(prompt_text)
    return template.render(**context)
