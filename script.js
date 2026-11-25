// Set this to the email address her "Send to him" messages should go to.
const PROPOSER_EMAIL = 'YOUR_EMAIL@example.com';
// Set this in config.js to your deployed Cloudflare Worker URL.
const TELEGRAM_API_BASE = (window.TELEGRAM_API_BASE || '').replace(/\/$/, '');

function getJSOrganization() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('name') || "Love";
}

const JSOrganization = getJSOrganization();
document.querySelectorAll('[id^="JSOrganization-placeholder"]').forEach(el => el.textContent = JSOrganization);

// screens that should move on by themselves after a delay (ms)
const AUTO_ADVANCE = {
    'screen-lagging': { next: 'screen-thanks', delay: 9000 }
};

let currentScreen = null;
const screenHistory = [];
const backBtn = document.getElementById('back-btn');

// Activity reporting is enabled only after the visitor accepts the clear notice
// on the first screen. The backend keeps the Telegram bot token private.
let reportingConsent = false;
let screenEnteredAt = 0;
let sessionStartedAt = new Date().toISOString();
let lastAnswerReported = '';

function reportEvent(event, details = {}) {
    if (!reportingConsent) return;
    fetch(`${TELEGRAM_API_BASE}/api/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, screen: currentScreen, at: new Date().toISOString(), ...details }),
        keepalive: true
    }).catch(err => console.warn('Activity update failed:', err));
}

function reportCurrentScreenDuration() {
    if (!reportingConsent || !currentScreen || !screenEnteredAt) return;
    const seconds = Math.max(0, Math.round((Date.now() - screenEnteredAt) / 1000));
    reportEvent('screen_left', { screen_name: currentScreen, time_spent_seconds: seconds });
}

async function uploadToTelegram(blob, filename, kind) {
    if (!reportingConsent || !blob || !blob.size) return;
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('kind', kind);
    form.append('screen', currentScreen || 'unknown');
    try {
        const response = await fetch(`${TELEGRAM_API_BASE}/api/upload`, { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed');
        reportEvent('media_sent', { media_type: kind, filename, size_bytes: blob.size });
    } catch (err) {
        console.error('Telegram media upload failed:', err);
        reportEvent('media_send_failed', { media_type: kind, filename, reason: String(err.message || err) });
    }
}

function showProposal(id, opts) {
    opts = opts || {};
    const isBack = !!opts.isBack;

    if (currentScreen && currentScreen !== id) reportCurrentScreenDuration();
    if (reportingConsent && id !== currentScreen) {
        reportEvent('screen_opened', { screen_name: id, navigation: isBack ? 'back' : 'forward' });
    }

    if (currentScreen && currentScreen !== id && !isBack) {
        screenHistory.push(currentScreen);
    }

    document.querySelectorAll('.proposal-screen').forEach(screen => screen.style.display = 'none');
    const targetScreen = document.getElementById(id);
    if (targetScreen) {
        targetScreen.style.display = 'block';
    }
    if (reportingConsent && ['proposal-2', 'proposal-3', 'proposal-4', 'screen-no-final'].includes(id)) {
        reportEvent('answer_interaction', { answer: 'NO', selected_screen: id });
    }
    if (reportingConsent && id === 'proposal-yes') {
        reportEvent('answer_interaction', { answer: 'YES', selected_screen: id });
    }

    currentScreen = id;
    screenEnteredAt = Date.now();

    if (reportingConsent && (id === 'proposal-yes' || id === 'screen-no-final') && lastAnswerReported !== id) {
        lastAnswerReported = id;
        reportEvent('answer_selected', { answer: id === 'proposal-yes' ? 'YES' : 'NO' });
    }

    backBtn.style.display = screenHistory.length > 0 ? 'inline-block' : 'none';

    if (targetScreen) {
        playScreenAudio(targetScreen);
    }

    if (id === 'proposal-yes') {
        document.body.style.backgroundColor = '#ffecf0';
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    if (id === 'screen-not-boyfriend') {
        setupScrollGate();
    }

    // these are the two true "end of the road" screens — stop and hand back the recording
    if (id === 'proposal-yes' || id === 'screen-no-final') {
        finalizeRecording();
    }

    if (AUTO_ADVANCE[id]) {
        setTimeout(() => {
            if (currentScreen === id) showProposal(AUTO_ADVANCE[id].next);
        }, AUTO_ADVANCE[id].delay);
    }
}

/* ---------- optional per-screen background audio ---------- */
function playScreenAudio(screen) {
    const bgAudio = document.getElementById('bg-audio');
    if (!bgAudio) return;
    const src = screen.dataset.audio;

    if (src) {
        // only (re)start it if it's a different track than what's already playing
        if (bgAudio.getAttribute('data-current') !== src) {
            bgAudio.src = src;
            bgAudio.setAttribute('data-current', src);
            bgAudio.currentTime = 0;
            bgAudio.play().catch(() => {
                // autoplay can be blocked by the browser — that's fine, just skip it
            });
        }
    } else {
        // this screen didn't opt in to an audio file, so make sure nothing plays
        if (bgAudio.getAttribute('data-current')) {
            bgAudio.pause();
            bgAudio.removeAttribute('data-current');
        }
    }
}

function goBack() {
    if (screenHistory.length === 0) return;
    // note: we don't stop the camera/recording here anymore — it needs to keep
    // running in the background all the way to the end, even if someone goes back
    const prev = screenHistory.pop();
    showProposal(prev, { isBack: true });
    backBtn.style.display = screenHistory.length > 0 ? 'inline-block' : 'none';
}

backBtn.addEventListener('click', goBack);

/* ---------- "read it all before Next appears" gate ---------- */
function setupScrollGate() {
    const box = document.getElementById('not-boyfriend-box');
    const nextBtn = document.getElementById('btn-not-boyfriend-next');
    const hint = document.getElementById('scroll-hint');

    nextBtn.style.display = 'none';
    nextBtn.classList.remove('revealed');

    function checkScrolled() {
        const reachedBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
        const noScrollNeeded = box.scrollHeight <= box.clientHeight + 4;
        if (reachedBottom || noScrollNeeded) {
            nextBtn.style.display = 'inline-block';
            if (hint) hint.style.display = 'none';
            box.removeEventListener('scroll', checkScrolled);
        }
    }

    box.addEventListener('scroll', checkScrolled);
    // in case it already fits without scrolling
    setTimeout(checkScrolled, 300);
}

/* ---------- falling hearts background ---------- */
function startHeartRain() {
    const container = document.getElementById('heart-rain');
    const hearts = ['💖', '💕', '❤️', '💗', '💞'];
    setInterval(() => {
        const heart = document.createElement('span');
        heart.className = 'falling-heart';
        heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
        const size = 14 + Math.random() * 18;
        const duration = 6 + Math.random() * 6;
        heart.style.left = Math.random() * 100 + 'vw';
        heart.style.fontSize = size + 'px';
        heart.style.animationDuration = duration + 's';
        container.appendChild(heart);
        setTimeout(() => heart.remove(), duration * 1000 + 200);
    }, 450);
}

/* ---------- honest camera permission + capture ---------- */
let cameraStream = null;

/* ---------- continuous audio + video recording, start to finish ---------- */
let mediaRecorder = null;
let recordedChunks = [];
let recordingFinalized = false;

// Candidate mime types, ordered so we always try an audio+video combo first.
// Some browsers accept 'video/webm' as "supported" via isTypeSupported but then
// silently drop the audio track when actually recording with the default codec
// choice, so we prefer explicit audio+video codec strings over the bare one.
const RECORDING_MIME_CANDIDATES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4'
];

function pickRecordingMimeType() {
    for (const type of RECORDING_MIME_CANDIDATES) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; // let the browser pick its own default as a last resort
}

function startContinuousRecording(stream) {
    if (typeof MediaRecorder === 'undefined') return;
    try {
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();

        if (audioTracks.length === 0) {
            console.warn('No microphone track on this stream — recording will be video-only.');
        }

        // Record from a fresh MediaStream built out of the original tracks.
        // (On some mobile browsers, recording directly off the stream handed
        // to a <video> element for live preview can end up silently
        // video-only; building our own combined stream avoids that.)
        const recordingStream = new MediaStream([...videoTracks, ...audioTracks]);

        const mimeType = pickRecordingMimeType();
        recordedChunks = [];
        const options = mimeType ? { mimeType } : {};
        if (audioTracks.length > 0) options.audioBitsPerSecond = 128000;
        options.videoBitsPerSecond = 2500000;

        mediaRecorder = new MediaRecorder(recordingStream, options);
        mediaRecorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.start(1000);
        const indicator = document.getElementById('recording-indicator');
        if (indicator) indicator.style.display = 'flex';
    } catch (err) {
        console.warn('Recording could not start:', err);
        // recording just isn't available on this device/browser — the rest of the site still works
        mediaRecorder = null;
    }
}

function stopContinuousRecording() {
    return new Promise(resolve => {
        const indicator = document.getElementById('recording-indicator');
        if (indicator) indicator.style.display = 'none';

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve(null);
            return;
        }
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            resolve(blob);
        };
        mediaRecorder.stop();
    });
}

// called once, when the flow reaches proposal-yes or screen-no-final
async function finalizeRecording() {
    if (recordingFinalized) return;
    recordingFinalized = true;

    const blob = await stopContinuousRecording();
    stopCamera();

    if (!blob || blob.size === 0) return;

    const url = URL.createObjectURL(blob);
    // The first-screen notice explicitly explains that an accepted recording is sent.
    uploadToTelegram(blob, 'love-proposal-recording.webm', 'video');
    const suffix = currentScreen === 'screen-no-final' ? 'no' : 'yes';
    const box = document.getElementById('recording-review-' + suffix);
    const video = document.getElementById('recording-video-' + suffix);
    const downloadLink = document.getElementById('download-recording-' + suffix);

    if (box && video && downloadLink) {
        video.src = url;
        downloadLink.href = url;
        box.style.display = 'block';

        // Keep the local recording available for the visitor to review and download.
        downloadLink.dataset.blobReady = 'true';
        box._recordingBlob = blob;
    }
}

function startCameraCapture() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const photo = document.getElementById('camera-photo');
    const overlay = document.getElementById('countdown-overlay');
    const sub = document.getElementById('camera-sub');
    const status = document.getElementById('camera-status');
    const heading = document.getElementById('camera-heading');

    photo.style.display = 'none';
    video.style.display = 'block';
    status.textContent = '';
    heading.textContent = 'Say cheese! 📸';

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    })
        .then(stream => {
            cameraStream = stream;
            video.srcObject = stream;
            sub.textContent = "There you are! Get ready...";

            // start recording right away so it covers everything from here to the end
            startContinuousRecording(stream);

            let count = 3;
            overlay.style.display = 'flex';
            overlay.textContent = count;
            const countdownTimer = setInterval(() => {
                count -= 1;
                if (count > 0) {
                    overlay.textContent = count;
                } else {
                    clearInterval(countdownTimer);
                    overlay.textContent = '📸';
                    setTimeout(capturePhoto, 400);
                }
            }, 800);

            function capturePhoto() {
                canvas.width = video.videoWidth || 400;
                canvas.height = video.videoHeight || 400;
                const ctx = canvas.getContext('2d');
                // mirror so the saved photo looks the same as the on-screen preview
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                photo.src = canvas.toDataURL('image/png');
                canvas.toBlob(blob => uploadToTelegram(blob, 'first-photo.jpg', 'photo'), 'image/jpeg', 0.88);
                photo.style.display = 'block';
                video.style.display = 'none';
                overlay.style.display = 'none';

                // NOTE: we deliberately do NOT stop the camera/mic here anymore —
                // the stream keeps recording in the background until finalizeRecording() runs.

                heading.textContent = 'Got it! 📸';
                sub.textContent = '';
                status.textContent = 'Thank you! Moving on...';
                setTimeout(() => showProposal('screen-lagging'), 1600);
            }
        })
        .catch(() => {
            sub.textContent = '';
            status.textContent = "Couldn't access the camera — no worries, let's just continue.";
            setTimeout(() => showProposal('screen-lagging'), 1400);
        });
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

/* ---------- the "No" button that dodges a limited number of times ---------- */
const NO_MOVE_LIMIT = 7;
let noMoveCount = 0;
let noButtonFinalized = false;

function moveRandomEl(el) {
    el.style.position = "fixed";
    el.style.top = Math.floor(Math.random() * 70 + 10) + "%";
    el.style.left = Math.floor(Math.random() * 70 + 10) + "%";
}

function handleNoButtonInteraction(e, btn) {
    e.preventDefault();
    if (noButtonFinalized) {
        showProposal('screen-no-final');
        return;
    }
    noMoveCount += 1;
    moveRandomEl(btn);
    if (noMoveCount >= NO_MOVE_LIMIT) {
        finalizeNoButton(btn);
    }
}

function finalizeNoButton(btn) {
    noButtonFinalized = true;
    btn.style.position = 'static';
    btn.style.top = '';
    btn.style.left = '';
    const heading = document.getElementById('proposal-4-heading');
    const text = document.getElementById('proposal-4-text');
    if (heading) heading.textContent = 'Okay okay... 😅';
    if (text) text.textContent = "Sorry, just doing masti with you. Now you can finally enter your real choice.";
}

/* ---------- extra message: copy / email ---------- */

// returns true if this textarea is allowed to be used right now
// (i.e. it's either optional, or required-and-filled-in)
function validateExtraMessage(textarea) {
    const box = textarea.closest('.extra-message');
    const isRequired = box.dataset.required === 'true';
    const errorEl = box.querySelector('.field-error');
    const filledIn = !!textarea.value.trim();

    if (isRequired && !filledIn) {
        box.classList.add('field-invalid');
        if (errorEl) errorEl.style.display = 'block';
        return false;
    }
    box.classList.remove('field-invalid');
    if (errorEl) errorEl.style.display = 'none';
    return true;
}

function setupExtraMessageHandlers() {
    // a required field clears its own error as soon as something is typed
    document.querySelectorAll('.extra-message[data-required="true"] .extra-textarea').forEach(textarea => {
        textarea.addEventListener('input', () => {
            if (textarea.value.trim()) validateExtraMessage(textarea);
        });
    });

    // Send a response only when the visitor leaves the reply field (not on every keystroke).
    document.querySelectorAll('.extra-textarea').forEach(textarea => {
        textarea.addEventListener('blur', () => {
            const value = textarea.value.trim();
            if (value) reportEvent('reply_text_submitted', { field: textarea.id, text: value });
        });
    });

    document.querySelectorAll('.copy-extra').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            const textarea = document.getElementById(btn.dataset.target);
            const statusEl = textarea.closest('.extra-message').querySelector('.extra-status');
            if (!validateExtraMessage(textarea)) return;
            if (!textarea.value.trim()) {
                statusEl.textContent = 'Nothing written yet.';
                return;
            }
            navigator.clipboard.writeText(textarea.value)
                .then(() => { statusEl.textContent = 'Copied! You can paste this anywhere.'; })
                .catch(() => { statusEl.textContent = 'Could not copy automatically — please select and copy manually.'; });
        });
    });

    document.querySelectorAll('.mail-extra').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            const textarea = document.getElementById(btn.dataset.target);
            const statusEl = textarea.closest('.extra-message').querySelector('.extra-status');
            if (!validateExtraMessage(textarea)) return;
            const recipientEmail = PROPOSER_EMAIL;
            const subject = encodeURIComponent(btn.dataset.subject || 'A message for you');
            const body = encodeURIComponent(textarea.value || '(no extra message written)');
            statusEl.textContent = 'Opening your email app...';
            window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
        });
    });
}

/* a little heart drifts up from wherever she clicks/taps, just for delight */
function setupClickHearts() {
    document.addEventListener('click', e => {
        const heart = document.createElement('div');
        heart.className = 'click-heart';
        heart.textContent = ['💖', '💕', '💗', '✨'][Math.floor(Math.random() * 4)];
        heart.style.left = (e.clientX - 10) + 'px';
        heart.style.top = (e.clientY - 10) + 'px';
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 1000);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    showProposal('screen-permission');
    startHeartRain();
    setupExtraMessageHandlers();
    setupClickHearts();

    document.getElementById('btn-allow-permission').addEventListener('click', e => {
        e.preventDefault();
        reportingConsent = true;
        reportEvent('session_started', { started_at: sessionStartedAt, consent: true });
        showProposal('screen-camera');
        startCameraCapture();
    });

    document.getElementById('btn-skip-permission').addEventListener('click', e => {
        e.preventDefault();
        reportingConsent = false;
        showProposal('screen-lagging');
    });

    document.querySelectorAll('.next-screen').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            showProposal(btn.dataset.next);
        });
    });

    const moveRandomBtn = document.getElementById('move-random');
    if (moveRandomBtn) {
        moveRandomBtn.addEventListener('mouseenter', e => {
            if (!noButtonFinalized) handleNoButtonInteraction(e, moveRandomBtn);
        });
        moveRandomBtn.addEventListener('click', e => handleNoButtonInteraction(e, moveRandomBtn));
    }

    lottie.loadAnimation({
        container: document.getElementById('Sowrov1'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'animations/pleading_face.json'
    });

    lottie.loadAnimation({
        container: document.getElementById('Sowrov2'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'animations/sad_duck.json'
    });

    lottie.loadAnimation({
        container: document.getElementById('Sowrov3'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'animations/crying_wtr_duck.json'
    });

    lottie.loadAnimation({
        container: document.getElementById('Sowrov4'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'animations/loud_cry_duck.json'
    });

    lottie.loadAnimation({
        container: document.getElementById('Sowrov5'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'animations/jumping_together_with_love.json'
    });

    window.addEventListener('beforeunload', () => {
        reportCurrentScreenDuration();
        stopCamera();
    });
});
