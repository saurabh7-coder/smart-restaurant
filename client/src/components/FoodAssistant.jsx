import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { money } from '../utils/format.js';

const OPENERS = [
  'Best vegetarian dish under ₹300?',
  'Something spicy with chicken',
  'What do you recommend?',
  'When are you open?',
];

/**
 * The floating food assistant.
 *
 * Answers questions about the menu, and — where the browser supports it — takes
 * a spoken order. Speech recognition runs entirely in the browser through the
 * Web Speech API: no audio ever leaves the device, only the transcript, which
 * is why the mic button is honest enough to say so.
 */
export function FoodAssistant() {
  const cart = useCart();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  const scroller = useRef(null);
  const recognition = useRef(null);

  useEffect(() => {
    api
      .getAiStatus()
      .then((res) => setStatus(res.data))
      .catch(() => setStatus(null));
  }, []);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Escape closes the panel — expected of anything that overlays the page,
  // and the only way out for someone not using a mouse.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        stopListening();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------------- speech ---------------- */

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  function startListening() {
    if (!speechSupported || listening) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Recognition();
    // en-IN matters here: dish names like "biryani" and "paneer" are recognised
    // far more reliably against an Indian English model than a US one.
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setDraft(transcript);
      // A spoken sentence is almost always an order, so route it to the parser
      // rather than the chatbot — "two paneer tikka" is not a question.
      handleVoiceOrder(transcript);
    };
    rec.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access was blocked. Allow it in your browser settings to order by voice.');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        toast.error('Could not hear that. Try again, or type it instead.');
      }
    };
    rec.onend = () => setListening(false);

    recognition.current = rec;
    setListening(true);
    rec.start();
  }

  function stopListening() {
    recognition.current?.stop();
    setListening(false);
  }

  /* ---------------- actions ---------------- */

  async function handleVoiceOrder(transcript) {
    setBusy(true);
    setMessages((m) => [...m, { role: 'you', text: transcript }]);
    try {
      const res = await api.parseOrder({ transcript });
      const { lines, unmatched } = res.data;

      if (lines.length === 0 && unmatched.length === 0) {
        setMessages((m) => [...m, { role: 'assistant', text: 'I did not catch a dish in that. Try naming one from the menu.' }]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: lines.length
              ? `I heard ${lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}.`
              : 'I could not match that to the menu.',
            order: lines,
            unclear: unmatched,
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: err.message }]);
    } finally {
      setBusy(false);
      setDraft('');
    }
  }

  /**
   * What to offer next, based on the answer just given.
   *
   * Derived from the reply rather than fixed, so the chips stay relevant: after
   * a price-filtered answer the useful next move is a different budget, after a
   * dish list it is dietary or spice. Keeps a guest moving without having to
   * think up the next question themselves.
   */
  function followUps(question, answer, dishes) {
    const q = `${question} ${answer}`.toLowerCase();
    const out = [];

    if (dishes?.length > 0) {
      if (!/vegan/.test(q)) out.push('Any vegan options?');
      if (!/spicy|mild/.test(q)) out.push('Something milder?');
      if (!/under|below|₹/.test(q)) out.push('Anything cheaper?');
      out.push(`What's in ${dishes[0].name}?`);
    } else {
      out.push('What do you recommend?', 'Show me something vegetarian');
    }

    if (!/open|hours/.test(q)) out.push('When are you open?');
    return out.slice(0, 3);
  }

  async function send(question) {
    const text = (question ?? draft).trim();
    if (!text || busy) return;

    setDraft('');
    setMessages((m) => [...m, { role: 'you', text }]);
    setBusy(true);

    try {
      const res = await api.askAssistant({
        question: text,
        history: messages.slice(-4).map((m) => ({ role: m.role, text: m.text })),
      });
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: res.data.answer,
          dishes: res.data.dishes,
          followUps: followUps(text, res.data.answer, res.data.dishes),
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: err.message }]);
    } finally {
      setBusy(false);
    }
  }

  function addAll(lines) {
    for (const line of lines) {
      cart.add({ _id: line.menuItem, name: line.name, price: line.price, image: line.image, foodType: line.foodType }, line.quantity);
    }
    toast.success(`Added ${lines.reduce((n, l) => n + l.quantity, 0)} items to your cart.`);
  }

  if (!open) {
    return (
      <button type="button" className="assistant-fab" onClick={() => setOpen(true)} aria-label="Ask about the menu">
        <span aria-hidden="true">💬</span>
      </button>
    );
  }

  return (
    <div className="assistant" role="dialog" aria-label="Food assistant">
      <header>
        <div>
          <strong>Ask about the menu</strong>
          {status && (
            <div className="faint" style={{ fontSize: '0.72rem' }}>
              {status.enabled ? 'Answering with Claude' : 'Built-in menu search'}
            </div>
          )}
        </div>
        <div className="header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMessages([])}
              aria-label="Clear conversation"
              title="Start over"
            >
              ↺
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>
      </header>

      <div className="assistant-body" ref={scroller}>
        {messages.length === 0 && (
          <>
            <p className="faint">
              Ask me what to eat — I only answer from tonight&apos;s menu, so I will never invent a
              dish or a price.
            </p>
            <div className="chip-row">
              {OPENERS.map((o) => (
                <button key={o} type="button" className="btn btn-ghost btn-sm" onClick={() => send(o)}>
                  {o}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className={`bubble ${m.role === 'you' ? 'from-guest' : 'from-bot'}`}>
            <p>{m.text}</p>

            {m.dishes?.length > 0 && (
              <div className="assistant-dishes">
                {m.dishes.map((d) => (
                  <button
                    key={d._id}
                    type="button"
                    className="assistant-dish"
                    onClick={() => {
                      cart.add(d, 1);
                      toast.success(`${d.name} added.`);
                    }}
                  >
                    {d.image && <img src={d.image} alt="" loading="lazy" />}
                    <span>
                      <strong>{d.name}</strong>
                      <small>{money(d.price)} · add</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {m.order?.length > 0 && (
              <>
                <ul className="assistant-order">
                  {m.order.map((l) => (
                    <li key={l.menuItem}>
                      {l.quantity} × {l.name} — {money(l.price * l.quantity)}
                      {l.allergyWarning && <div className="allergy-inline">⚠️ {l.allergyWarning}</div>}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-sm" onClick={() => addAll(m.order)}>
                  Add all to cart
                </button>
              </>
            )}

            {m.followUps?.length > 0 && i === messages.length - 1 && !busy && (
              <div className="assistant-followups">
                {m.followUps.map((f) => (
                  <button key={f} type="button" onClick={() => send(f)}>
                    {f}
                  </button>
                ))}
              </div>
            )}

            {m.unclear?.length > 0 && (
              <div className="assistant-unclear">
                {m.unclear.map((u) => (
                  <div key={u.heard}>
                    <span className="faint">I did not catch “{u.heard}”.</span>
                    {u.suggestions.length > 0 && (
                      <div className="chip-row" style={{ marginTop: '0.35rem' }}>
                        {u.suggestions.map((s) => (
                          <button
                            key={s.menuItem}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => addAll([s])}
                          >
                            {s.quantity} × {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && <div className="bubble from-bot"><p className="faint">Thinking…</p></div>}
      </div>

      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {speechSupported && (
          <button
            type="button"
            className={`icon-btn mic${listening ? ' listening' : ''}`}
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? 'Stop listening' : 'Order by voice'}
            title={listening ? 'Listening — say your order' : 'Order by voice'}
          >
            {listening ? '⏹' : '🎤'}
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Ask, or say “two paneer tikka”'}
          maxLength={500}
          disabled={busy}
        />
        <button type="submit" className="btn btn-sm" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>

      {speechSupported && (
        <p className="assistant-foot faint">
          Voice is transcribed by your browser — the audio never leaves your device.
        </p>
      )}
    </div>
  );
}
