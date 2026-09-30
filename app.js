(() => {
  const config = window.PVT_CONFIG;
  const $ = id => document.getElementById(id);

  const screens = {
    entry: $("entry-screen"),
    confirm: $("confirm-screen"),
    ready: $("ready-screen"),
    test: $("test-screen"),
    complete: $("complete-screen")
  };

  let participantCode = "";
  let session = null;
  let controller = null;

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
  }

  function makeSession(code) {
    return {
      participantCode: code,
      sessionId: crypto.randomUUID(),
      testVersion: config.version,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "in_progress",
      config: {
        testType: config.testType,
        durationMs: config.durationMs,
        fixationMs: config.fixationMs,
        minIsiMs: config.minIsiMs,
        maxIsiMs: config.maxIsiMs,
        tooFastMs: config.tooFastMs,
        lapseMs: config.lapseMs,
        sleepAttackMs: config.sleepAttackMs
      },
      device: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screenWidth: screen.width,
        screenHeight: screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        touchSupported: navigator.maxTouchPoints > 0,
        maxTouchPoints: navigator.maxTouchPoints
      },
      trials: []
    };
  }

  async function checkpoint() {
    try { await window.PVTStorage.save(session); }
    catch (error) { console.error("IndexedDB checkpoint failed:", error); }
  }

  async function requestFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch (_) {}
  }

  async function uploadSession() {
    const status = $("upload-status");
    const retry = $("retry-upload");
    const home = $("new-session");

    status.textContent = "Saving your results…";
    retry.classList.add("hidden");
    home.classList.add("hidden");

    try {
      const response = await fetch(config.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session)
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      await window.PVTStorage.remove(session.sessionId);
      status.textContent = "Your results have been saved successfully.";
      home.classList.remove("hidden");
    } catch (error) {
      console.error(error);
      status.textContent = "Your results are saved on this device, but could not be uploaded. Please keep this page open and retry.";
      retry.classList.remove("hidden");
    }
  }

  $("participant-form").addEventListener("submit", event => {
    event.preventDefault();
    participantCode = $("participant-code").value.trim();
    if (!participantCode) return;
    $("confirmed-code").textContent = participantCode;
    show("confirm");
  });

  $("back-main").addEventListener("click", () => show("entry"));

  $("confirm-start").addEventListener("click", () => {
    session = makeSession(participantCode);
    show("ready");
  });

  screens.ready.addEventListener("pointerdown", async event => {
    event.preventDefault();
    if (!session || controller) return;

    await requestFullscreen();
    await checkpoint();
    show("test");

    controller = new window.PVTController({
      config,
      elements: {
        test: screens.test,
        fixation: $("fixation"),
        stimulus: $("stimulus"),
        feedback: $("feedback")
      },
      session,
      onTrial: async trial => {
        session.trials.push(trial);
        await checkpoint();
      },
      onFinish: async () => {
        session.completedAt = new Date().toISOString();
        session.status = "completed";
        await checkpoint();
        show("complete");
        await uploadSession();
      }
    });

    controller.start();
  }, { passive: false });

  $("retry-upload").addEventListener("click", uploadSession);
  $("new-session").addEventListener("click", () => window.location.reload());

  // Warn rather than silently abandoning an active test.
  window.addEventListener("beforeunload", event => {
    if (session?.status === "in_progress") {
      event.preventDefault();
      event.returnValue = "";
    }
  });
})();
