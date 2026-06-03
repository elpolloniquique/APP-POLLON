import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, Send, Sparkles } from 'lucide-react';
import { useBranch } from '../../context/BranchContext';
import { useBranchMenu } from '../../context/BranchMenuContext';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import {
  POLLITO_WELCOME,
  POLLITO_BRANCH_OPTIONS,
  POLLITO_QUICK_ACTIONS,
  matchBranchFromText,
} from '../../config/pollitoBot';
import {
  branchToPollitoContext,
  buildPollitoSiteContext,
  buildPollitoMenuContext,
  formatBranchConfirm,
} from '../../utils/pollitoContext';
import { sendPollitoMessage } from '../../services/pollitoChatService';
import { storeCategoryUrl } from '../../utils/format';

const STORAGE_KEY = 'pollon_pollito_branch_v1';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderText(text) {
  return String(text || '').split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line.replace(/\*\*(.*?)\*\*/g, '$1')}
    </span>
  ));
}

export function PollitoBot() {
  const { branches, branch: siteBranch, setBranch, whatsapp } = useBranch();
  const { categories, productsByCategory, menuBranchId } = useBranchMenu();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const enabled = import.meta.env.VITE_POLLITO_ENABLED !== 'false';

  const activeBranches = useMemo(
    () => branches.filter((b) => !b.comingSoon && b.isActive !== false),
    [branches],
  );

  const siteContext = useMemo(
    () => buildPollitoSiteContext(activeBranches),
    [activeBranches],
  );

  const waLink = useMemo(() => {
    const num = selectedBranch?.whatsapp || whatsapp;
    const text = encodeURIComponent('Hola, quiero hacer un pedido en El Pollón 🍗');
    return `https://wa.me/${num}?text=${text}`;
  }, [selectedBranch, whatsapp]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    if (!open || initialized) return;
    const savedId = localStorage.getItem(STORAGE_KEY);
    const savedBranch = savedId ? activeBranches.find((b) => b.id === savedId) : null;
    const initial = savedBranch || siteBranch;

    setMessages([{ id: uid(), role: 'assistant', content: POLLITO_WELCOME }]);
    if (initial) setSelectedBranch(initial);
    setInitialized(true);
  }, [open, initialized, activeBranches, siteBranch]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, open, scrollToBottom]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, loading]);

  const pickBranch = (branchId) => {
    const b = activeBranches.find((x) => x.id === branchId);
    if (!b) return;
    setSelectedBranch(b);
    localStorage.setItem(STORAGE_KEY, b.id);
    setBranch(b, { force: true });
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: 'assistant', content: formatBranchConfirm(b) },
    ]);
  };

  const sendUserMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    let branchForApi = selectedBranch;
    let extraAssistant = null;

    if (!branchForApi) {
      const detected = matchBranchFromText(trimmed, activeBranches);
      if (detected) {
        branchForApi = detected;
        setSelectedBranch(detected);
        localStorage.setItem(STORAGE_KEY, detected.id);
        setBranch(detected, { force: true });
        extraAssistant = formatBranchConfirm(detected);
      }
    }

    const userMsg = { id: uid(), role: 'user', content: trimmed };
    let nextMessages = [...messages, userMsg];
    if (extraAssistant) {
      nextMessages = [...nextMessages, { id: uid(), role: 'assistant', content: extraAssistant }];
    }
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    if (!branchForApi) {
      setLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: 'Para brindarte información correcta, primero necesito saber sobre qué sucursal deseas consultar. Selecciona una opción arriba 👆',
        },
      ]);
      return;
    }

    try {
      const apiMessages = nextMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const { reply } = await sendPollitoMessage({
        messages: apiMessages,
        branchContext: branchToPollitoContext(branchForApi),
        menuContext: branchForApi.id === menuBranchId
          ? buildPollitoMenuContext(categories, productsByCategory)
          : [],
        siteContext,
      });

      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: `🐥 Ups, tuve un problemita técnico. ${err.message || 'Intenta de nuevo en un momento.'}\n\nTambién puedes escribirnos por WhatsApp y te atenderá nuestro equipo al instante.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendUserMessage(input);
  };

  if (!enabled) return null;

  const tiendaLink = selectedBranch
    ? storeCategoryUrl(categories[0]?.id || '', selectedBranch.id)
    : '/tienda';

  return (
    <>
      {!open && (
        <button
          type="button"
          className="pollito-launcher"
          onClick={() => setOpen(true)}
          aria-label="Abrir Pollito Bot"
          title="Pollito Bot — Asistente El Pollón"
        >
          <span className="pollito-launcher__emoji" aria-hidden>🐥</span>
          <span className="pollito-launcher__label">Pollito Bot</span>
        </button>
      )}

      {open && (
        <div className="pollito-panel" role="dialog" aria-label="Pollito Bot">
          <header className="pollito-panel__header">
            <div className="pollito-panel__brand">
              <span className="pollito-panel__avatar" aria-hidden>🐥</span>
              <div>
                <p className="pollito-panel__title">Pollito Bot</p>
                <p className="pollito-panel__subtitle">
                  <Sparkles className="inline h-3 w-3 text-amber-300" aria-hidden />
                  {' '}Asistente oficial · El Pollón
                </p>
              </div>
            </div>
            <button type="button" className="pollito-panel__close" onClick={() => setOpen(false)} aria-label="Cerrar chat">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="pollito-panel__messages admin-scroll-panel">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`pollito-msg ${msg.role === 'user' ? 'pollito-msg--user' : 'pollito-msg--bot'}`}
              >
                {msg.role === 'assistant' && <span className="pollito-msg__avatar" aria-hidden>🐥</span>}
                <div className="pollito-msg__bubble">{renderText(msg.content)}</div>
              </div>
            ))}

            {!selectedBranch && initialized && (
              <div className="pollito-branch-grid">
                {POLLITO_BRANCH_OPTIONS.map((opt) => {
                  const exists = activeBranches.some((b) => b.id === opt.id);
                  if (!exists) return null;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className="pollito-branch-btn"
                      onClick={() => pickBranch(opt.id)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {loading && (
              <div className="pollito-msg pollito-msg--bot">
                <span className="pollito-msg__avatar" aria-hidden>🐥</span>
                <div className="pollito-msg__bubble pollito-msg__typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <div className="pollito-quick-actions scrollbar-hide">
            {POLLITO_QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="pollito-quick-btn"
                disabled={loading}
                onClick={() => sendUserMessage(action.message)}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="pollito-panel__cta">
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="pollito-wa-btn">
                <WhatsAppIcon className="h-5 w-5" title="" />
                Realizar pedido por WhatsApp
              </a>
              <Link to={tiendaLink} className="pollito-store-link" onClick={() => setOpen(false)}>
                Ver carta online →
              </Link>
            </div>

          <form className="pollito-panel__form" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedBranch ? 'Escribe tu consulta…' : 'Primero elige sucursal arriba…'}
              className="pollito-panel__input"
              disabled={loading}
              maxLength={500}
              autoComplete="off"
            />
            <button type="submit" className="pollito-panel__send" disabled={loading || !input.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
