"use client";

import { systemText } from "@/lib/i18n";


import { useI18n } from "@/components/i18n-provider";

import { atajoBandeja } from "@/lib/atajos";
import { hayDialogoAbierto } from "@/components/atajos-globales";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Clock3,
  FileText,
  Lock,
  Mic,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import type { ConversationDto, MessageDto, TemplateDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL } from "@/lib/channels";
import {
  citaDe,
  formatBytes,
  formatRemaining,
  formatRemainingLong,
} from "./helpers";
import { QuoteBlock } from "./quote-block";
import { TemplateSender } from "./template-sender";
import { validarImagenAdjunta } from "@/lib/imagen-adjunta";
import { EmojiPicker } from "./emoji-picker";
import { insertAtSelection } from "@/lib/emojis";
import { VoiceRecorder, type NotaGrabada } from "./voice-recorder";
import { QuickReplyMenu } from "./quick-reply-menu";
import { guardarBorrador, leerBorrador } from "@/lib/borradores";
import {
  aplicarRespuesta,
  filtrarRespuestas,
  rellenarVariables,
  tokenRapido,
  type RespuestaRapida,
} from "@/lib/respuestas-rapidas";

export function Composer({
  conversation,
  onSend,
  onSent,
  replyTo = null,
  onReplyChange,
  children,
  onNota,
}: {
  conversation: ConversationDto;
  onSend: (text: string, replyTo: MessageDto | null) => Promise<string | null>;
  onSent: () => void;
  /** 039: el mensaje al que se está respondiendo citando, si hay. */
  replyTo?: MessageDto | null;
  onReplyChange?: (m: MessageDto | null) => void;
  /** 043 — El hilo: la zona donde se suelta una imagen es la conversación entera. */
  children?: ReactNode;
  /**
   * 050 — Guardar una nota interna (solo la ve el equipo). Con ella aparecen
   * las pestañas «Responder | Nota interna», también con la ventana cerrada.
   * Devuelve el error a mostrar, o `null`.
   */
  onNota?: (texto: string) => Promise<string | null>;
}) {
  const { t: tr } = useI18n();
  // 051 — Lo que quedó escrito en esta conversación vuelve al regresar a ella.
  const [text, setText] = useState(() => leerBorrador("responder", conversation.id));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 042 — `sending` tarda un render en verse; esto corta el doble envío ya.
  const mediaSending = useRef(false);
  // 041 — Dónde dejar el cursor cuando el texto con el emoji ya se pintó.
  const emojiCaret = useRef<number | null>(null);
  // 043 — Entrar y salir de los hijos dispara dragenter/dragleave en cascada:
  // se cuenta la profundidad para que el indicador no parpadee.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  // 044 — La grabadora ocupa el lugar de la caja mientras está abierta.
  const [grabando, setGrabando] = useState(false);
  // 049 — Respuestas rápidas: la lista de la organización (null = sin cargar),
  // el `/atajo` que se está escribiendo y la opción resaltada. `cerradoEn`
  // guarda dónde empezaba el token que se cerró con Escape: no vuelve a abrir
  // hasta que se escriba otra `/`.
  const [respuestas, setRespuestas] = useState<RespuestaRapida[] | null>(null);
  const [puedeEditarRespuestas, setPuedeEditarRespuestas] = useState(false);
  const [token, setToken] = useState<{ inicio: number; consulta: string } | null>(null);
  const [activa, setActiva] = useState(0);
  const [cerradoEn, setCerradoEn] = useState<number | null>(null);
  // 050 — Responder al cliente o anotar para el equipo.
  const [modo, setModo] = useState<"responder" | "nota">("responder");
  const notaRef = useRef<HTMLTextAreaElement>(null);
  // 055 · D3 — Alt+R escribe una respuesta y Alt+N una nota interna, también
  // con el foco en la caja. Con un diálogo abierto no actúan.
  const hayNotas = Boolean(onNota);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const atajo = atajoBandeja(e);
      if (atajo !== "responder" && atajo !== "nota") return;
      if (hayDialogoAbierto()) return;
      if (atajo === "nota" && !hayNotas) return;
      e.preventDefault();
      setModo(atajo === "nota" ? "nota" : "responder");
      setError(null);
      // Tras pintar la otra pestaña: el foco va a su caja.
      requestAnimationFrame(() => (atajo === "nota" ? notaRef : taRef).current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hayNotas]);
  const [nota, setNota] = useState(() => leerBorrador("nota", conversation.id));
  const [guardandoNota, setGuardandoNota] = useState(false);
  // Hay caja de texto libre (ventana normal, o la humana de Instagram/Messenger).
  const textoLibre = conversation.windowOpen || Boolean(conversation.humanWindow?.open);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) => {
        if (!cancelled)
          setTemplates((d.templates ?? []).filter((t) => t.status === "approved"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 039: al elegir «Responder» se escribe ya, sin buscar el campo.
  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // 043 — Soltar un archivo fuera del chat abriría el archivo en la pestaña y
  // el CRM (con el borrador) se perdería. Mientras haya conversación abierta,
  // un archivo soltado en otro punto de la página no hace nada.
  useEffect(() => {
    const esArchivo = (e: globalThis.DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const frenar = (e: globalThis.DragEvent) => {
      if (esArchivo(e)) e.preventDefault();
    };
    window.addEventListener("dragover", frenar);
    window.addEventListener("drop", frenar);
    return () => {
      window.removeEventListener("dragover", frenar);
      window.removeEventListener("drop", frenar);
    };
  }, []);

  // La URL del preview de imagen se libera al reemplazar/limpiar el archivo.
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  // 051 — Cada cambio se guarda como borrador (vaciar la caja lo borra; enviar
  // la vacía). El adjunto no: 028 D5.
  useEffect(() => {
    guardarBorrador("responder", conversation.id, text);
  }, [text, conversation.id]);
  useEffect(() => {
    guardarBorrador("nota", conversation.id, nota);
  }, [nota, conversation.id]);
  // Un borrador largo vuelve con la caja a su altura.
  useEffect(() => {
    // Solo al montar: después lo hace onChange.
    autogrow();
  }, []);

  // 049 — La lista se pide una vez: el compositor se monta de nuevo con cada
  // conversación (028 D5).
  useEffect(() => {
    let vivo = true;
    fetch("/api/quick-replies")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { respuestas?: RespuestaRapida[]; puedeEditar?: boolean } | null) => {
        if (!vivo || !d) return;
        setRespuestas(d.respuestas ?? []);
        setPuedeEditarRespuestas(Boolean(d.puedeEditar));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el || emojiCaret.current === null) return;
    el.focus();
    el.setSelectionRange(emojiCaret.current, emojiCaret.current);
    emojiCaret.current = null;
    autogrow();
  }, [text]);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  /** 049 — Relee el `/atajo` que hay antes del cursor (al teclear, hacer clic o moverse). */
  function releerToken() {
    const el = taRef.current;
    if (!el) return;
    const t = el.selectionStart === el.selectionEnd ? tokenRapido(el.value, el.selectionStart) : null;
    setToken((antes) => {
      if (t?.inicio !== antes?.inicio || t?.consulta !== antes?.consulta) setActiva(0);
      return t;
    });
    if (!t) setCerradoEn(null);
  }

  /** 049 — Cambia el `/atajo` por la respuesta (con `{nombre}` relleno); no envía. */
  function elegirRespuesta(r: RespuestaRapida) {
    const el = taRef.current;
    if (!el || !token) return;
    const insercion = rellenarVariables(r.texto, conversation.contact.name);
    const next = aplicarRespuesta(text, token.inicio, el.selectionStart, insercion);
    emojiCaret.current = next.cursor;
    setText(next.texto);
    setToken(null);
    setCerradoEn(null);
  }

  /** 041 — El emoji entra en el cursor (o en lugar de la selección); no envía. */
  function insertEmoji(emoji: string) {
    const el = taRef.current;
    if (!el || sending) return;
    const next = insertAtSelection(text, el.selectionStart, el.selectionEnd, emoji);
    if (next.text === text) {
      // Reemplazar un emoji por el mismo no cambia el texto ni dispara el
      // efecto: el cursor se coloca aquí.
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      return;
    }
    emojiCaret.current = next.caret;
    setText(next.text);
  }

  function pickFile(f: File | null) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(f);
    setFilePreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setError(null);
  }

  /**
   * 042 — Una imagen del portapapeles (o, 043, soltada en el chat): se valida
   * aquí y queda como adjunto. Nunca envía.
   */
  function attachImage(files: File[], origen: "paste" | "drop") {
    if (sending || mediaSending.current) return;
    if (!conversation.composer.media) {
      setError(`Pegar y arrastrar imágenes está disponible en WhatsApp; ${CHANNEL_LABEL[conversation.channel]} no admite adjuntos.`);
      return;
    }
    if (!textoLibre) {
      setError(tr("La ventana está cerrada: no se puede adjuntar una imagen. Solo sale una plantilla."));
      return;
    }
    const result = validarImagenAdjunta(files, origen);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    pickFile(result.file);
    taRef.current?.focus();
  }

  function isFileDrag(e: DragEvent<HTMLDivElement>) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  /** Con un diálogo modal abierto (reenviar imagen), soltar no adjunta atrás. */
  function modalAbierto(e: DragEvent<HTMLDivElement>) {
    return e.currentTarget.querySelector('[role="dialog"][aria-modal="true"]') !== null;
  }

  /**
   * 043 — La conversación entera (el hilo, que llega como `children`, y el
   * compositor) acepta una imagen soltada. Solo reacciona a arrastres de
   * archivos: arrastrar texto o un enlace sigue como siempre.
   */
  function withDropZone(content: ReactNode, conError = false) {
    const acceptsDrop = conversation.composer.media && textoLibre && !sending;
    return (
      <div
        role="region"
        aria-label={tr("Chat: adjuntar imagen")}
        // 061 — El hilo con su compositor es una tarjeta en escritorio. El
        // fondo (con sus dibujos) es de la tarjeta: hilo y compositor van
        // transparentes encima, así los dibujos no se cortan entre los dos.
        className="thread-bg relative flex min-h-0 flex-1 flex-col bg-chat lg:tarjeta lg:overflow-hidden"
        onDragEnter={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current++;
          if (acceptsDrop && !modalAbierto(e)) setDragging(true);
        }}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = acceptsDrop ? "copy" : "none";
        }}
        onDragLeave={(e) => {
          if (!isFileDrag(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (modalAbierto(e)) return;
          attachImage(Array.from(e.dataTransfer.files), "drop");
        }}
      >
        {children}
        {content}
        {conError && error && (
          <p role="alert" className="bg-background px-[18px] pb-3 text-xs text-destructive">
            {error}
          </p>
        )}
        {dragging && acceptsDrop && (
          <div
            role="status"
            className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-brand-tint p-4"
          >
            <p className="rounded-md bg-background px-4 py-3 text-center text-sm font-semibold text-brand-ink shadow-sm">
              {tr("Suelta la imagen para adjuntarla")} </p>
          </div>
        )}
      </div>
    );
  }

  async function apiSend(path: string, init: RequestInit): Promise<string | null> {
    try {
      const res = await fetch(path, init);
      if (res.ok) return null;
      // apiError responde `{ error: { code, message } }`.
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return data?.error?.message ?? `Error ${res.status}`;
    } catch {
      return "No se pudo conectar con el servidor. Lo que ibas a mandar sigue aquí para reintentar.";
    }
  }

  async function submit() {
    setError(null);

    if (file) {
      // El adjunto sí espera: sube el archivo y no tiene sentido encolar otro
      // mientras tanto.
      if (mediaSending.current) return;
      mediaSending.current = true;
      dragDepth.current = 0;
      setDragging(false);
      setSending(true);
      const form = new FormData();
      form.set("file", file);
      const caption = text.trim();
      if (caption) form.set("caption", caption);
      if (replyTo) form.set("replyToMessageId", replyTo.id);
      const err = await apiSend(
        `/api/conversations/${conversation.id}/messages/media`,
        { method: "POST", body: form }
      );
      setSending(false);
      mediaSending.current = false;
      if (err) {
        setError(err);
        return;
      }
      pickFile(null);
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
      onReplyChange?.(null);
      onSent();
      return;
    }

    const value = text.trim();
    if (!value) return;
    // Aquí NO se espera al servidor. Enviar tarda ~1.5 s (el viaje a Meta) y
    // durante ese rato el renglón siguiente se escribía encima del anterior y
    // salía todo como un solo mensaje. El campo se limpia ya; la burbuja
    // "enviando" del hilo es la que informa el estado real.
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    const cita = replyTo;
    onReplyChange?.(null);
    const err = await onSend(value, cita);
    if (err) {
      setError(err);
      // 039: la cita vuelve con el texto.
      if (cita) onReplyChange?.(cita);
      // Lo que no salió vuelve al campo. Si ya empezaste a escribir otra cosa
      // se antepone en vez de pisarte: nada se pierde en silencio.
      setText((actual) => (actual ? `${value}\n${actual}` : value));
      taRef.current?.focus();
      setTimeout(autogrow, 0);
    }
  }

  /** 044 — La nota grabada sale por el mismo envío de adjuntos, marcada como voz. */
  async function enviarNota(nota: NotaGrabada): Promise<string | null> {
    if (mediaSending.current) return "Ya se está enviando un adjunto.";
    mediaSending.current = true;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("file", nota.archivo);
    form.set("voice", "1");
    if (replyTo) form.set("replyToMessageId", replyTo.id);
    const err = await apiSend(`/api/conversations/${conversation.id}/messages/media`, {
      method: "POST",
      body: form,
    });
    setSending(false);
    mediaSending.current = false;
    if (err) return err;
    setGrabando(false);
    onReplyChange?.(null);
    onSent();
    return null;
  }

  // 022 — TikTok no tiene plantillas ni otra forma de reabrir: con la ventana
  // cerrada no hay nada que ofrecer, solo decir qué pasa y qué lo arregla.
  // 050 — Las pestañas van arriba en TODAS las ramas: anotar no depende de
  // la ventana de Meta, y con la ventana cerrada es cuando más se necesita.
  const pestanas = onNota ? (
    <div role="tablist" aria-label={tr("Qué escribir")} className="mb-2 flex gap-1">
      {(
        [
          ["responder", tr("Responder")],
          ["nota", tr("Nota interna")],
        ] as const
      ).map(([valor, etiqueta]) => (
        <button
          key={valor}
          type="button"
          role="tab"
          aria-selected={modo === valor}
          onClick={() => {
            setModo(valor);
            setError(null);
          }}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            modo === valor
              ? valor === "nota"
                ? "bg-warning-tint text-warning-text ring-1 ring-warning-soft"
                : "bg-brand-tint text-brand-text"
              : "text-text-3 hover:bg-secondary hover:text-foreground"
          )}
        >
          {valor === "nota" && <Lock className="mr-1 inline h-3 w-3 align-[-1px]" strokeWidth={2} />}
          {etiqueta}
        </button>
      ))}
    </div>
  ) : null;

  async function guardarNota() {
    const texto = nota.trim();
    if (!onNota || !texto || guardandoNota) return;
    setGuardandoNota(true);
    setError(null);
    const err = await onNota(texto);
    setGuardandoNota(false);
    if (err) setError(err);
    else setNota("");
  }

  if (onNota && modo === "nota") {
    return withDropZone(
      <div className="px-[18px] pb-3.5 pt-2">
        {pestanas}
        <div
          data-modo="nota"
          className="flex items-end gap-2 rounded-[18px] border border-warning-soft bg-warning-tint py-1.5 pl-3 pr-1.5"
        >
          <Lock className="mb-2 h-4 w-4 shrink-0 text-warning-text" strokeWidth={1.8} aria-hidden />
          <textarea
            ref={notaRef}
            value={nota}
            rows={2}
            autoFocus
            placeholder={tr("Nota interna: solo la ve tu equipo…")}
            aria-label={tr("Nota interna")}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void guardarNota();
              } else if (e.key === "Escape") {
                setModo("responder");
              }
            }}
            className="max-h-[120px] w-full resize-none self-center bg-transparent py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-warning-text placeholder:opacity-70"
          />
          <button
            onClick={() => void guardarNota()}
            disabled={guardandoNota || !nota.trim()}
            className={cn(
              "shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity",
              (guardandoNota || !nota.trim()) && "opacity-40"
            )}
          >
            {guardandoNota ? tr("Guardando…") : tr("Guardar nota")}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : (
            <span />
          )}
          <p className="font-mono text-[10.5px] tracking-[0.04em] text-text-3">
            {tr("No se envía al cliente")} </p>
        </div>
      </div>
    );
  }

  if (!conversation.windowOpen && conversation.channel === "tiktok") {
    return withDropZone(
      <div className="px-[18px] py-3.5">
        {pestanas}
        <div className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">{tr("La ventana de 48 horas de TikTok está cerrada.")}</p>
            <p className="opacity-80">
              {tr("TikTok solo deja contestar dentro de las 48 horas siguientes al último mensaje del cliente, y no permite reabrir la conversación. Podrás escribirle cuando vuelva a mandar un mensaje.")}</p>
          </div>
        </div>
      </div>,
      true
    );
  }

  // 024 — Instagram y Messenger no tienen plantillas. Pasadas 24 horas una
  // persona todavía puede contestar (hasta 7 días, sigue abajo con su aviso);
  // pasado ese plazo no hay nada que ofrecer salvo esperar al cliente.
  const human = conversation.humanWindow;
  const canal = CHANNEL_LABEL[conversation.channel];
  if (!conversation.windowOpen && human && !human.open) {
    return withDropZone(
      <div className="px-[18px] py-3.5">
        {pestanas}
        <div
          data-window="closed"
          className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text"
        >
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">{tr("La ventana de atención de ")}{canal} {tr(" está cerrada.")}</p>
            <p className="opacity-80">
              {canal} {tr(" deja contestar hasta 7 días después del último mensaje del cliente, y no tiene plantillas para reabrir la conversación. Podrás escribirle cuando vuelva a mandar un mensaje.")}</p>
          </div>
        </div>
      </div>,
      true
    );
  }

  if (!conversation.windowOpen && !human) {
    return withDropZone(
      <div className="px-[18px] py-3.5">
        {pestanas}
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">{tr("La ventana de 24 horas está cerrada.")}</p>
            <p className="opacity-80">
              {tr("WhatsApp solo permite texto libre dentro de las 24 horas siguientes al último mensaje del cliente. Para retomar la conversación, envía una plantilla aprobada.")}</p>
          </div>
        </div>
        <TemplateSender conversationId={conversation.id} onSent={onSent} />
      </div>,
      true
    );
  }

  // 049 — El menú de respuestas rápidas, si hay una `/` escribiéndose.
  const opcionesRapidas = token ? filtrarRespuestas(respuestas ?? [], token.consulta).slice(0, 50) : [];
  const menuRapido = token !== null && respuestas !== null && cerradoEn !== token.inicio;

  const canSubmit = file !== null || text.trim().length > 0;
  // 044 — Con la caja vacía el botón graba, como en WhatsApp.
  const puedeGrabar = conversation.composer.media && !file && !text.trim();

  const soloPersona = !conversation.windowOpen && Boolean(human?.open);

  return withDropZone(
    <div className="relative px-[18px] pb-3.5 pt-2">
      {pestanas}

      {soloPersona && (
        <div
          data-window="human"
          className="mb-2.5 flex items-start gap-2 rounded-md border border-info-soft bg-info-tint p-2.5 text-xs text-info-text"
        >
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
          <p>
            <span className="font-semibold">{tr("Solo puede contestar una persona.")}</span>{" "}
            {tr("Pasaron más de 24 horas desde el último mensaje del cliente: ")}{canal}{" "}
            {tr("te deja responder a ti hasta 7 días, al agente ya no.")}</p>
        </div>
      )}
      {templates.length > 0 && !file && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {templates.slice(0, 4).map((t) => (
            <button
              key={t.id}
              className="rounded-full border border-border-strong bg-background px-3 py-1 text-xs font-semibold text-text-2 transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand-text"
              onClick={() => {
                const firstName = conversation.contact.name.split(" ")[0] ?? "";
                setText(t.body.replace(/\{\{\s*1\s*\}\}/g, firstName));
                taRef.current?.focus();
                setTimeout(autogrow, 0);
              }}
              title={t.body}
            >
              {t.name.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div
          data-replying-to={replyTo.id}
          className="mb-2.5 flex items-center gap-2 rounded-md border bg-subtle p-2"
        >
          <QuoteBlock
            cita={citaDe(replyTo)}
            contactName={conversation.contact.name}
            className="flex-1"
          />
          <button
            onClick={() => onReplyChange?.(null)}
            aria-label={tr("Cancelar respuesta")}
            title={tr("Cancelar respuesta")}
            className="shrink-0 rounded p-1 text-text-3 hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      )}

      {file && (
        <div className="mb-2.5 flex items-center gap-2.5 rounded-md border bg-subtle p-2.5">
          {filePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={filePreview}
              alt={file.name}
              className="h-14 w-14 rounded object-cover"
            />
          ) : (
            <FileText className="h-8 w-8 shrink-0 text-brand" strokeWidth={1.5} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-text-3">
              {formatBytes(file.size)} {tr(" · el texto de abajo va como pie del adjunto")}</p>
          </div>
          <button
            onClick={() => pickFile(null)}
            disabled={sending}
            aria-label={tr("Quitar adjunto")}
            className="rounded p-1 text-text-3 hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      )}

      {grabando ? (
        <VoiceRecorder
          onSend={enviarNota}
          onCancel={() => setGrabando(false)}
          onError={(msg) => {
            setGrabando(false);
            setError(msg);
          }}
        />
      ) : (
      /* 061 · D5 — La caja en cápsula y, aparte, el botón redondo de enviar
         (o grabar), como en la referencia del diseño de tarjetas. */
      <div className="flex items-end gap-2.5">
      <div className="flex min-w-0 flex-1 items-end gap-2 rounded-[23px] border border-border bg-background py-1.5 pl-2 pr-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          disabled={sending}
          onChange={(e) => {
            if (!sending) pickFile(e.target.files?.[0] ?? null);
            // Elegir el mismo archivo otra vez también avisa.
            e.target.value = "";
          }}
        />
        {menuRapido && (
          <QuickReplyMenu
            opciones={opcionesRapidas}
            activa={activa}
            vacio={(respuestas ?? []).length === 0}
            puedeEditar={puedeEditarRespuestas}
            onElegir={elegirRespuesta}
            onActiva={setActiva}
          />
        )}
        <EmojiPicker disabled={sending} onSelect={insertEmoji} />
        {/* 028: solo lo que el canal puede mandar; en las redes, la caja sola.
            045: ubicación y contacto ya no se ofrecen (el servidor los sigue
            sabiendo enviar, para un cerebro conectado). */}
        {conversation.composer.media && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label={tr("Adjuntar archivo")}
            title={tr("Adjuntar imagen, video, audio o documento")}
            className="shrink-0 rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
        )}
        <textarea
          ref={taRef}
          placeholder={file ? tr("Pie del adjunto (opcional)…") : tr("Escribe una respuesta…")}
          value={text}
          rows={1}
          onPaste={(e) => {
            const images = Array.from(e.clipboardData.items).filter(
              (item) => item.kind === "file" && item.type.startsWith("image/")
            );
            if (images.length === 0) return; // texto: el pegado de siempre
            e.preventDefault();
            const files = images.map((item) => item.getAsFile());
            if (files.some((f) => !f)) {
              setError(tr("No se pudo leer la imagen del portapapeles. Cópiala de nuevo."));
              return;
            }
            attachImage(files as File[], "paste");
          }}
          onChange={(e) => {
            setText(e.target.value);
            autogrow();
            releerToken();
          }}
          onSelect={releerToken}
          onBlur={() => setToken(null)}
          onKeyDown={(e) => {
            // 049 — Con el menú abierto, el teclado es suyo.
            if (menuRapido) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = opcionesRapidas.length;
                if (n) setActiva((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
                return;
              }
              if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                e.preventDefault();
                const elegida = opcionesRapidas[activa];
                if (elegida) elegirRespuesta(elegida);
                else setCerradoEn(token!.inicio);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setCerradoEn(token!.inicio);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && replyTo) {
              onReplyChange?.(null);
            }
          }}
          className="max-h-[120px] w-full resize-none self-center bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-text-3"
        />
      </div>
        {puedeGrabar ? (
          <button
            onClick={() => {
              setError(null);
              setGrabando(true);
            }}
            disabled={sending}
            aria-label={tr("Grabar nota de voz")}
            title={tr("Grabar nota de voz")}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-enviar text-enviar-texto shadow-sm transition-[opacity,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              sending && "opacity-40"
            )}
          >
            <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={sending || !canSubmit}
            aria-label={tr("Enviar")}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-enviar text-enviar-texto shadow-sm transition-[opacity,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              (sending || !canSubmit) && "opacity-40"
            )}
          >
            <Send className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        )}
      </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        {error ? <p role="alert" className="text-xs text-destructive">{systemText(tr.locale, error)}</p> : <span />}
        <p className="font-mono text-[10.5px] tracking-[0.04em] text-text-3">
          {soloPersona
            ? tr("Ventana humana · quedan {v0}", {v0: formatRemainingLong(human!.remainingMs, tr.locale)})
            : tr("Ventana abierta · quedan {v0}", {v0: formatRemaining(conversation.windowRemainingMs)})}
        </p>
      </div>
    </div>
  );
}
