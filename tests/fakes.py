from app.llm import LLMError


class ScriptedLLM:
    """Fake LLM. `answers` maps prompt -> raw answer; `extractor(raw, n_call)` returns JSON text."""

    def __init__(self, answers, extractor, fail_prompts=(), raise_on=None):
        self.answers, self.extractor = answers, extractor
        self.fail_prompts, self.raise_on = set(fail_prompts), raise_on
        self.extract_calls: dict[str, int] = {}

    async def complete(self, system, user, *, temperature=0.2, max_tokens=None):
        if self.raise_on and user in self.raise_on:
            raise self.raise_on[user]
        if user in self.fail_prompts:
            raise LLMError("provider returned HTTP 500")
        return self.answers[user]

    async def call_tool(self, system, user, *, tool_name, parameters, temperature=0.0):
        assert tool_name == "submit_mentions" and "mentions" in parameters["properties"]
        raw = user.split("Text:\n", 1)[1]
        n = self.extract_calls[raw] = self.extract_calls.get(raw, 0) + 1
        return self.extractor(raw, n)
