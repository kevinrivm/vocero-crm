/* Vocero CRM public form widget. Structured config + DOM APIs only; no HTML eval. */
(() => {
  "use strict";

  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) return;
  const apiOrigin = new URL(script.src, window.location.href).origin;
  const styleText = `
    :host { display:block; color-scheme:light; color:#0d181c; font:400 14px/1.5 var(--vocero-form-font,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif); }
    * { box-sizing:border-box; }
    .card { max-width:520px; margin:0 auto; padding:24px; border:1px solid #d4dae0; border-radius:var(--vocero-form-radius,12px); background:#fff; box-shadow:0 8px 24px rgba(13,24,28,.08); }
    .eyebrow { margin:0 0 7px; color:var(--vocero-form-accent,#00afb9); font:700 10px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace; letter-spacing:.14em; text-transform:uppercase; }
    h2 { margin:0; color:#0d181c; font-size:22px; line-height:1.25; letter-spacing:-.025em; }
    .description { margin:7px 0 20px; color:#5b6466; font-size:13px; }
    .field { margin:0 0 14px; }
    label { display:block; margin-bottom:6px; color:#24343a; font-size:12px; font-weight:650; }
    input { display:block; width:100%; min-height:42px; padding:9px 11px; border:1px solid #d4dae0; border-radius:8px; background:#fff; color:#0d181c; font:inherit; outline:none; }
    input:focus { border-color:var(--vocero-form-accent,#00afb9); box-shadow:0 0 0 3px color-mix(in srgb,var(--vocero-form-accent,#00afb9) 18%,transparent); }
    .phone-note { margin:5px 0 0; color:#5b6466; font-size:11px; }
    .schedule { margin:0 0 17px; padding:12px; border:1px solid #d4dae0; border-radius:10px; background:#f0f4f7; }
    .schedule-title { margin:0 0 9px; color:#24343a; font-size:12px; font-weight:700; }
    .zone { float:right; color:#5b6466; font-size:10px; font-weight:400; }
    .slots { display:grid; grid-template-columns:repeat(auto-fit,minmax(92px,1fr)); gap:7px; }
    .slot { min-height:36px; border:1px solid #d4dae0; border-radius:7px; background:#fff; color:#435257; font:inherit; font-size:12px; font-weight:600; cursor:pointer; }
    .slot:hover,.slot[aria-pressed="true"] { border-color:var(--vocero-form-accent,#00afb9); color:#006d73; }
    .slot[aria-pressed="true"] { background:color-mix(in srgb,var(--vocero-form-accent,#00afb9) 10%,white); }
    .message { margin:8px 0 0; color:#5b6466; text-align:center; font-size:12px; }
    .error { margin:10px 0; padding:9px 10px; border:1px solid #f0cccc; border-radius:7px; background:#fff3f3; color:#a83232; font-size:12px; }
    .submit { width:100%; min-height:43px; margin-top:3px; border:0; border-radius:8px; background:var(--vocero-form-accent,#00afb9); color:var(--vocero-form-accent-fg,#0d181c); font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
    .submit:hover { filter:brightness(.93); }
    .submit:disabled { cursor:not-allowed; opacity:.58; }
    .privacy { margin:12px 0 0; color:#5b6466; text-align:center; font-size:10px; }
    .success { padding:16px; border:1px solid #bfe4cc; border-radius:10px; background:#eef9f1; color:#17683a; }
    .success h3 { margin:0; font-size:14px; }
    .success p { margin:5px 0 0; font-size:12px; }
    .honeypot { position:absolute!important; left:-10000px!important; width:1px!important; height:1px!important; overflow:hidden!important; }
    @media (max-width:480px) { .card { padding:19px; } h2 { font-size:20px; } }
  `;

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  async function mount(host) {
    if (host.dataset.voceroMounted === "true") return;
    const slug = host.dataset.slug || "";
    const kind = host.dataset.kind || "contact";
    if (!slug || !["contact", "booking"].includes(kind)) return;
    host.dataset.voceroMounted = "true";
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const style = make("style");
    style.textContent = styleText;
    const card = make("section", "card");
    card.setAttribute("aria-busy", "true");
    card.append(make("p", "message", "Cargando formulario…"));
    shadow.replaceChildren(style, card);

    const base = `${apiOrigin}/api/public/forms/${encodeURIComponent(slug)}`;
    const request = async (url, options) => {
      const response = await fetch(url, { ...options, credentials: "omit", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || "No se pudo completar la solicitud.");
      return { body, status: response.status };
    };

    try {
      const { body: payload } = await request(`${base}/config?kind=${kind}`);
      const config = payload.config;
      card.replaceChildren();
      card.removeAttribute("aria-busy");
      card.append(make("p", "eyebrow", kind === "booking" ? "AGENDA · VOCERO CRM" : "CONTACTO · VOCERO CRM"));
      card.append(make("h2", "", config.title));
      card.append(make("p", "description", config.description));

      const form = make("form");
      form.noValidate = false;
      let selectedSlot = null;
      let bookingDate = null;
      let slotsArea = null;
      let submitButton = null;
      let scheduleStatus = null;
      let loadingSlots = false;

      if (kind === "booking") {
        const dateGroup = make("div", "field");
        const dateId = `vocero-date-${Math.random().toString(36).slice(2)}`;
        const dateLabel = make("label", "", "Fecha");
        dateLabel.htmlFor = dateId;
        bookingDate = make("input");
        bookingDate.id = dateId;
        bookingDate.name = "bookingDate";
        bookingDate.type = "date";
        dateGroup.append(dateLabel, bookingDate);
        const schedule = make("section", "schedule");
        const scheduleTitle = make("p", "schedule-title", "Horarios disponibles");
        const zone = make("span", "zone");
        scheduleTitle.append(zone);
        slotsArea = make("div", "slots");
        scheduleStatus = make("p", "message", "Buscando horarios…");
        schedule.append(scheduleTitle, slotsArea, scheduleStatus);
        form.append(dateGroup, schedule);
      }

      const enabledFields = [...config.fields].filter((field) => field.enabled).sort((a, b) => a.position - b.position);
      for (const field of enabledFields) {
        const group = make("div", "field");
        const inputId = `vocero-${field.key}-${Math.random().toString(36).slice(2)}`;
        const label = make("label", "", `${field.label}${field.required ? "" : " (opcional)"}`);
        label.htmlFor = inputId;
        const input = make("input");
        input.id = inputId;
        input.name = field.key;
        input.type = field.key === "phone" ? "tel" : field.key === "email" ? "email" : "text";
        input.autocomplete = field.key === "phone" ? "tel" : field.key === "email" ? "email" : "name";
        input.required = field.required;
        input.maxLength = field.key === "phone" ? 24 : field.key === "email" ? 254 : 120;
        input.placeholder = field.key === "phone" ? "+52 55 1234 5678" : field.key === "email" ? "tu@correo.com" : "Tu nombre";
        if (field.key === "phone") input.inputMode = "tel";
        group.append(label, input);
        if (field.key === "phone" && kind === "contact") group.append(make("p", "phone-note", "Lo usamos para encontrar o crear tu ficha de contacto."));
        form.append(group);
      }

      const honeypot = make("div", "honeypot");
      honeypot.setAttribute("aria-hidden", "true");
      const honeyLabel = make("label", "", "Sitio web");
      honeyLabel.htmlFor = `vocero-website-${Math.random().toString(36).slice(2)}`;
      const honeyInput = make("input");
      honeyInput.name = "website";
      honeyInput.id = honeyLabel.htmlFor;
      honeyInput.tabIndex = -1;
      honeyInput.autocomplete = "off";
      honeypot.append(honeyLabel, honeyInput);
      form.append(honeypot);

      const errorNode = make("p", "error");
      errorNode.hidden = true;
      errorNode.setAttribute("role", "alert");
      form.append(errorNode);
      submitButton = make("button", "submit", config.submitLabel);
      submitButton.type = "submit";
      submitButton.disabled = kind === "booking";
      form.append(submitButton);
      form.append(make("p", "privacy", "Tus datos se guardan de forma segura en el CRM."));
      card.append(form);

      const loadSlots = async (dateValue) => {
        if (!slotsArea || !scheduleStatus || !bookingDate) return;
        loadingSlots = true;
        selectedSlot = null;
        submitButton.disabled = true;
        submitButton.textContent = config.submitLabel;
        scheduleStatus.hidden = false;
        scheduleStatus.className = "message";
        scheduleStatus.textContent = "Buscando horarios…";
        slotsArea.replaceChildren();
        try {
          const path = dateValue ? `&date=${encodeURIComponent(dateValue)}` : "";
          const { body: availability } = await request(`${base}/availability?${path.replace(/^&/, "")}`);
          if (availability.today) bookingDate.min = availability.today;
          if (availability.maxDate) bookingDate.max = availability.maxDate;
          if (availability.date) bookingDate.value = availability.date;
          const zone = card.querySelector(".zone");
          if (zone) zone.textContent = availability.timezone || "";
          if (availability.slots?.length) {
            scheduleStatus.hidden = true;
            for (const slot of availability.slots) {
              const button = make("button", "slot", slot.time || slot.label);
              button.type = "button";
              button.setAttribute("aria-pressed", "false");
              button.addEventListener("click", () => {
                selectedSlot = slot;
                for (const sibling of slotsArea.querySelectorAll(".slot")) sibling.setAttribute("aria-pressed", "false");
                button.setAttribute("aria-pressed", "true");
                submitButton.disabled = false;
                submitButton.textContent = `${config.submitLabel} · ${slot.label || slot.time}`;
              });
              slotsArea.append(button);
            }
          } else {
            scheduleStatus.textContent = "No hay horarios disponibles ese día. Prueba otra fecha.";
          }
        } catch (error) {
          scheduleStatus.className = "error";
          scheduleStatus.textContent = error instanceof Error ? error.message : "No se pudo cargar la disponibilidad.";
        } finally {
          loadingSlots = false;
        }
      };

      if (bookingDate) {
        bookingDate.addEventListener("change", () => { void loadSlots(bookingDate.value); });
        await loadSlots("");
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (loadingSlots) return;
        if (kind === "booking" && !selectedSlot) {
          errorNode.hidden = false;
          errorNode.textContent = "Selecciona un horario disponible.";
          return;
        }
        errorNode.hidden = true;
        submitButton.disabled = true;
        submitButton.textContent = kind === "booking" ? "Confirmando…" : "Enviando…";
        const values = new FormData(form);
        const data = {
          name: values.get("name"),
          phone: String(values.get("phone") || "").replace(/\D/g, ""),
          email: values.get("email") || undefined,
          website: values.get("website"),
        };
        if (kind === "booking") data.startUtc = selectedSlot.startUtc;
        try {
          const { status } = await request(`${base}/${kind === "booking" ? "bookings" : "contacts"}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          const success = make("div", "success");
          success.setAttribute("role", "status");
          success.append(make("h3", "", status === 202 ? "Recibimos tu solicitud" : kind === "booking" ? "Cita confirmada" : "Recibimos tus datos"));
          success.append(make("p", "", status === 202 ? "Gracias. El equipo revisará tu solicitud." : kind === "booking" ? `Horario: ${selectedSlot.label || selectedSlot.time}` : `Gracias. El equipo de ${payload.organizationName} se pondrá en contacto contigo.`));
          card.replaceChildren(success);
        } catch (error) {
          errorNode.hidden = false;
          errorNode.textContent = error instanceof Error ? error.message : "No se pudo enviar. Inténtalo de nuevo.";
          submitButton.disabled = kind === "booking" && !selectedSlot;
          submitButton.textContent = kind === "booking" && selectedSlot ? `${config.submitLabel} · ${selectedSlot.label || selectedSlot.time}` : config.submitLabel;
        }
      });
    } catch (error) {
      card.replaceChildren(make("p", "error", error instanceof Error ? error.message : "No se pudo cargar el formulario."));
      card.removeAttribute("aria-busy");
    }
  }

  document.querySelectorAll("[data-vocero-form]").forEach((host) => { void mount(host); });
})();
