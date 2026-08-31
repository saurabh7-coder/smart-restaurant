import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

/**
 * Claude integration.
 *
 * ── The design rule ─────────────────────────────────────────────────────────
 * Every AI feature in this app has a working non-AI path. Claude makes the
 * output better where genuine language understanding helps — writing a dish
 * description, reading the nuance in a review, answering an open-ended question
 * — but the restaurant must not stop working because a key is missing, a
 * request times out, or the API is down at dinner service.
 *
 * So this module is deliberately thin, and every caller is written as:
 *
 *     const ai = await complete(...);       // null when unavailable
 *     return ai ?? deterministicFallback(); // always returns something
 *
 * Same pattern as the payment gateway: configured is better, unconfigured
 * still serves food.
 */

const MODEL = 'claude-opus-5';

let client = null;

/** True when a key is present. Checked per call, so adding a key needs no redeploy. */
export function isAiConfigured() {
  return Boolean(env.anthropicApiKey);
}

function getClient() {
  if (!isAiConfigured()) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * One Claude call, returning plain text — or `null` if anything at all goes
 * wrong. Callers must treat null as "use the fallback", never as an error.
 *
 * @param {object}  opts
 * @param {string}  opts.system     system prompt
 * @param {string}  opts.prompt     the user turn
 * @param {number} [opts.maxTokens] output cap
 * @param {string} [opts.effort]    low | medium | high
 * @param {number} [opts.timeoutMs] wall-clock budget; a hungry guest will not wait
 */
export async function complete({ system, prompt, maxTokens = 1024, effort = 'low', timeoutMs = 20000 }) {
  const api = getClient();
  if (!api) return null;

  try {
    const response = await api.messages.create(
      {
        model: MODEL,
        max_tokens: maxTokens,
        system,
        // Effort is the cost/latency lever. These are short, well-specified
        // tasks over a small menu, so 'low' is the right default — the depth
        // is only raised for review analysis, which involves real judgement.
        output_config: { effort },
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: timeoutMs },
    );

    // Safety classifiers can decline a request; that arrives as a normal 200
    // with stop_reason 'refusal' and possibly empty content, so check it
    // before indexing into the blocks.
    if (response.stop_reason === 'refusal') return null;

    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim() || null;
  } catch (err) {
    // Rate limits, timeouts, outages, bad keys — all the same to the caller.
    console.warn('[claude] falling back to the local path:', err.message);
    return null;
  }
}

/**
 * A Claude call that must return JSON matching a schema.
 *
 * Uses structured outputs rather than "reply with only JSON" plus a parser,
 * because the constraint is enforced by the API instead of hoped for — there
 * is no stray prose to strip and no half-written object to guess at.
 */
export async function completeJson({ system, prompt, schema, maxTokens = 2048, effort = 'low', timeoutMs = 25000 }) {
  const api = getClient();
  if (!api) return null;

  try {
    const response = await api.messages.create(
      {
        model: MODEL,
        max_tokens: maxTokens,
        system,
        output_config: {
          effort,
          format: { type: 'json_schema', schema },
        },
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: timeoutMs },
    );

    if (response.stop_reason === 'refusal') return null;
    // A truncated response is not valid JSON — treat it as unavailable rather
    // than parsing a fragment.
    if (response.stop_reason === 'max_tokens') return null;

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn('[claude] structured call fell back:', err.message);
    return null;
  }
}

/** What the UI shows about AI availability, so it can be honest either way. */
export function aiStatus() {
  return {
    enabled: isAiConfigured(),
    model: isAiConfigured() ? MODEL : null,
    note: isAiConfigured()
      ? 'Claude is answering questions, writing descriptions and reading reviews.'
      : 'Running on the built-in engine. Add ANTHROPIC_API_KEY for richer language understanding.',
  };
}
