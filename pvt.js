window.PVTController = class PVTController {
  constructor({ config, elements, session, onTrial, onFinish }) {
    this.config = config;
    this.el = elements;
    this.session = session;
    this.onTrial = onTrial;
    this.onFinish = onFinish;

    this.state = "IDLE";
    this.trialNumber = 0;
    this.timer = null;
    this.stimulusOnset = null;
    this.currentIsi = null;
    this.trialStartedAt = null;
    this.responseLocked = false;
    this.testStartedAt = null;

    this.handlePointer = this.handlePointer.bind(this);
    this.handleKey = this.handleKey.bind(this);
  }

  start() {
    this.testStartedAt = performance.now();
    this.session.testStartedAtMs = this.testStartedAt;
    this.el.test.addEventListener("pointerdown", this.handlePointer, { passive: false });
    window.addEventListener("keydown", this.handleKey);
    this.nextTrial();
  }

  stopListeners() {
    this.el.test.removeEventListener("pointerdown", this.handlePointer);
    window.removeEventListener("keydown", this.handleKey);
  }

  nowFromEvent(event) {
    // Modern DOMHighResTimeStamp values share the performance time origin.
    // Fall back to performance.now() if the value is unavailable or implausible.
    const t = Number(event?.timeStamp);
    if (Number.isFinite(t) && t >= 0 && Math.abs(t - performance.now()) < 60000) return t;
    return performance.now();
  }

  randomIsi() {
    return this.config.minIsiMs + Math.random() * (this.config.maxIsiMs - this.config.minIsiMs);
  }

  classify(rt) {
    if (rt < this.config.tooFastMs) return "too_fast";
    if (rt < this.config.lapseMs) return "correct";
    if (rt < this.config.sleepAttackMs) return "lapse";
    return "sleep_attack";
  }

  setState(state) {
    this.state = state;
  }

  hideAll() {
    this.el.fixation.classList.add("hidden");
    this.el.stimulus.classList.add("hidden");
    this.el.feedback.classList.add("hidden");
  }

  nextTrial() {
    if (this.trialNumber > 0 && performance.now() - this.testStartedAt >= this.config.durationMs) return this.finish();

    this.trialNumber += 1;
    this.responseLocked = false;
    this.hideAll();
    this.setState("FIXATION");
    this.trialStartedAt = performance.now();
    this.el.fixation.classList.remove("hidden");

    this.timer = setTimeout(() => {
      this.el.fixation.classList.add("hidden");
      this.beginWaiting();
    }, this.config.fixationMs);
  }

  beginWaiting() {
    this.setState("WAITING");
    this.currentIsi = this.randomIsi();
    this.timer = setTimeout(() => this.showStimulus(), this.currentIsi);
  }

  showStimulus() {
    if (this.state !== "WAITING") return;
    this.setState("STIMULUS");
    this.el.stimulus.classList.remove("hidden");

    // Timestamp immediately adjacent to the DOM change. requestAnimationFrame could
    // instead timestamp a presentation frame; hardware display latency still cannot
    // be measured by browser JavaScript alone.
    this.stimulusOnset = performance.now();

    this.timer = setTimeout(() => {
      if (this.state === "STIMULUS") this.recordStimulusResponse(performance.now(), "timeout");
    }, this.config.stimulusTimeoutMs);
  }

  handleKey(event) {
    if (event.code !== "Space") return;
    event.preventDefault();
    this.processResponse(this.nowFromEvent(event), "keyboard");
  }

  handlePointer(event) {
    event.preventDefault();
    this.processResponse(this.nowFromEvent(event), event.pointerType || "pointer");
  }

  processResponse(timestamp, inputType) {
    if (this.responseLocked) return;

    if (this.state === "WAITING") {
      this.responseLocked = true;
      clearTimeout(this.timer);
      this.recordPremature(timestamp, inputType);
      return;
    }

    if (this.state === "STIMULUS") {
      this.responseLocked = true;
      clearTimeout(this.timer);
      this.recordStimulusResponse(timestamp, inputType);
    }
  }

  async recordPremature(timestamp, inputType) {
    const waitingStart = this.trialStartedAt + this.config.fixationMs;
    const rt = -(timestamp - waitingStart);
    const trial = {
      trial: this.trialNumber,
      isiMs: this.currentIsi,
      stimulusOnsetMs: null,
      responseTimestampMs: timestamp,
      rtMs: rt,
      type: "premature",
      inputType
    };
    await this.onTrial(trial);
    this.showFeedback("Too fast");
  }

  async recordStimulusResponse(timestamp, inputType) {
    this.el.stimulus.classList.add("hidden");
    const rt = timestamp - this.stimulusOnset;
    const type = inputType === "timeout" ? "timeout" : this.classify(rt);
    const trial = {
      trial: this.trialNumber,
      isiMs: this.currentIsi,
      stimulusOnsetMs: this.stimulusOnset,
      responseTimestampMs: timestamp,
      rtMs: rt,
      type,
      inputType
    };
    await this.onTrial(trial);
    this.showFeedback(inputType === "timeout" ? "No response" : `${Math.round(rt)} ms`);
  }

  showFeedback(text) {
    this.setState("FEEDBACK");
    this.hideAll();
    const delay = this.config.feedbackEnabled ? this.config.feedbackMs : this.config.noFeedbackPauseMs;

    if (this.config.feedbackEnabled) {
      this.el.feedback.textContent = text;
      this.el.feedback.classList.remove("hidden");
    }

    this.timer = setTimeout(() => {
      this.hideAll();
      this.setState("INTER_TRIAL");
      this.timer = setTimeout(() => this.nextTrial(), this.config.interTrialPauseMs);
    }, delay);
  }

  finish() {
    clearTimeout(this.timer);
    this.session.plannedDurationMs = this.config.durationMs;
    this.session.actualDurationMs = performance.now() - this.testStartedAt;
    this.hideAll();
    this.setState("FINISHED");
    this.stopListeners();
    this.onFinish();
  }
};
