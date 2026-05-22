import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    serverTimestamp, 
    doc, 
    updateDoc, 
    increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const URL = "https://teachablemachine.withgoogle.com/models/bq80Qv2eD/"; 

let model, webcam, labelContainer, maxPredictions;

// ── Lock state ──
let locked         = false;
let lockedType     = "";
let lockedConf     = 0;
let neutralFrames  = 0;
const NEUTRAL_UNLOCK_FRAMES = 20;

// ══════════════════════════════════════════
// WASTE DATA — full info per type
// ══════════════════════════════════════════
const wasteData = {
    "Plastic": {
        bin:      "Blue Bin",
        binColor: "#1565C0",
        binBg:    "#E3F2FD",
        emoji:    "♻️",
        process: [
            "Sort by plastic type (check the number inside the triangle).",
            "Rinse out food residue — contaminated plastic can reject an entire batch.",
            "Remove caps and labels if possible; flatten bottles to save space.",
            "Collected plastics are shredded, melted, and pelletized into raw material for new products."
        ],
        impact: {
            co2:   "1 plastic bottle recycled = ~100g CO₂ saved",
            water: "Saves ~2 liters of water per bottle vs. producing virgin plastic",
            stat:  "Recycling 1 ton of plastic saves ~5,774 kWh of energy"
        },
        harm: "Plastic takes 400–1,000 years to decompose in landfills. It fragments into microplastics that contaminate soil, rivers, and ocean food chains — eventually entering the human body through seafood and drinking water."
    },
    "Paper": {
        bin:      "Blue Bin",
        binColor: "#1565C0",
        binBg:    "#E3F2FD",
        emoji:    "📄",
        process: [
            "Keep paper dry — wet paper cannot be recycled.",
            "Remove plastic windows from envelopes and metal staples.",
            "Flatten cardboard boxes to reduce volume.",
            "Paper is pulped with water, cleaned, screened, and reformed into new sheets."
        ],
        impact: {
            co2:   "Recycling 1 ton of paper saves ~17 trees",
            water: "Saves ~26,500 liters of water per ton recycled",
            stat:  "Reduces landfill methane emissions significantly"
        },
        harm: "Paper decomposing in landfills produces methane — a greenhouse gas 25× more potent than CO₂. Manufacturing virgin paper also destroys forests that absorb carbon."
    },
    "Metal": {
        bin:      "Blue Bin",
        binColor: "#1565C0",
        binBg:    "#E3F2FD",
        emoji:    "🥫",
        process: [
            "Rinse cans to remove food residue.",
            "Wrap sharp edges in cardboard before placing in the bin.",
            "Metals are sorted magnetically (steel) or by eddy current (aluminum).",
            "Melted down and cast into new metal products — infinitely recyclable without quality loss."
        ],
        impact: {
            co2:   "Recycling aluminum uses 95% less energy than making it from ore",
            water: "1 recycled aluminum can saves enough energy to run a TV for 3 hours",
            stat:  "Steel recycling saves ~1.5 tons of CO₂ per ton produced"
        },
        harm: "Metal in landfills leaches heavy metals (lead, cadmium, chromium) into soil and groundwater, contaminating drinking water and harming ecosystems for decades."
    },
    "Glass": {
        bin:      "Blue Bin",
        binColor: "#1565C0",
        binBg:    "#E3F2FD",
        emoji:    "🫙",
        process: [
            "Rinse bottles and jars thoroughly.",
            "Wrap in cardboard or newspaper to prevent injury during collection.",
            "Sort by color if your facility requires it (clear, green, brown).",
            "Glass is crushed into cullet, melted, and blown or pressed into new containers — 100% recyclable indefinitely."
        ],
        impact: {
            co2:   "Recycling 1 glass bottle saves enough energy to power a computer for 25 minutes",
            water: "Produces 20% less air pollution than making glass from raw silica",
            stat:  "Every ton of recycled glass saves ~315 kg of CO₂"
        },
        harm: "Broken glass in landfills injures waste workers and wildlife. Glass also takes over 1 million years to break down naturally and never truly biodegrades."
    },
    "Biodegradable": {
        bin:      "Green Bin",
        binColor: "#2E7D32",
        binBg:    "#E8F5E9",
        emoji:    "🌿",
        process: [
            "Separate from plastics, metals, and non-organic waste.",
            "Place in the Green Bin for composting collection.",
            "Organic matter is composted aerobically — microbes break it down into humus.",
            "Finished compost enriches soil, reduces need for chemical fertilizers."
        ],
        impact: {
            co2:   "Composting food waste instead of landfilling saves ~0.5 kg CO₂ per kg of waste",
            water: "Finished compost improves soil water retention by up to 20%",
            stat:  "Diverts ~30% of household waste from landfills"
        },
        harm: "Biodegradable waste buried in landfills decomposes without oxygen (anaerobic), producing methane — a powerful greenhouse gas. It also generates leachate that can contaminate groundwater."
    }
};

// ══════════════════════════════════════════
// RICH EXPANDED TOAST
// ══════════════════════════════════════════
function injectToastStyles() {
    if (document.getElementById('eco-toast-styles')) return;
    const s = document.createElement('style');
    s.id = 'eco-toast-styles';
    s.textContent = `
        #eco-toast-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 10000;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding: 0 0 24px;
            animation: ecoOverlayIn 0.22s ease;
        }
        @keyframes ecoOverlayIn { from { opacity:0 } to { opacity:1 } }

        #eco-toast-card {
            width: min(480px, calc(100vw - 24px));
            max-height: 82vh;
            background: #fff;
            border-radius: 24px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 64px rgba(0,0,0,0.22);
            animation: ecoCardIn 0.3s cubic-bezier(0.34,1.2,0.64,1);
            font-family: 'Outfit', sans-serif;
        }
        @keyframes ecoCardIn {
            from { opacity:0; transform:translateY(40px) scale(0.95) }
            to   { opacity:1; transform:translateY(0) scale(1) }
        }

        .eco-toast-header {
            padding: 20px 22px 16px;
            display: flex;
            align-items: flex-start;
            gap: 14px;
            flex-shrink: 0;
        }
        .eco-toast-icon {
            width: 46px; height: 46px;
            border-radius: 14px;
            display: flex; align-items: center; justify-content: center;
            font-size: 22px;
            flex-shrink: 0;
        }
        .eco-toast-title-group { flex: 1; min-width: 0; }
        .eco-toast-title { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0 0 4px; line-height: 1.2; }
        .eco-toast-subtitle { font-size: 13px; color: #777; margin: 0; }
        .eco-toast-bin-pill {
            display: inline-flex; align-items: center; gap: 6px;
            border-radius: 50px; padding: 5px 14px;
            font-size: 12px; font-weight: 700; margin-top: 8px; letter-spacing: 0.3px;
        }
        .eco-toast-bin-dot { width: 8px; height: 8px; border-radius: 50%; }
        .eco-toast-close {
            background: #F5F5F5; border: none; border-radius: 50%;
            width: 32px; height: 32px; font-size: 18px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: #555; flex-shrink: 0; transition: background 0.15s;
        }
        .eco-toast-close:hover { background: #E0E0E0; }

        .eco-toast-tabs {
            display: flex; gap: 4px; padding: 0 22px;
            border-bottom: 1px solid #F0F0F0; flex-shrink: 0;
        }
        .eco-tab-btn {
            padding: 10px 14px; font-size: 12px; font-weight: 700;
            border: none; background: none; cursor: pointer; color: #999;
            border-bottom: 2px solid transparent; margin-bottom: -1px;
            letter-spacing: 0.3px; text-transform: uppercase;
            font-family: 'Outfit', sans-serif;
            transition: color 0.15s, border-color 0.15s; white-space: nowrap;
        }
        .eco-tab-btn.active { color: #2E7D32; border-bottom-color: #2E7D32; }

        .eco-toast-body {
            overflow-y: auto; flex: 1; padding: 20px 22px 24px;
            -webkit-overflow-scrolling: touch;
        }
        .eco-toast-body::-webkit-scrollbar { width: 4px; }
        .eco-toast-body::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }

        .eco-tab-panel { display: none; }
        .eco-tab-panel.active { display: block; }

        .eco-step { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .eco-step:last-child { margin-bottom: 0; }
        .eco-step-num {
            width: 26px; height: 26px; border-radius: 50%;
            background: #E8F5E9; color: #2E7D32;
            font-size: 12px; font-weight: 800;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; margin-top: 1px;
        }
        .eco-step-text { font-size: 14px; color: #333; line-height: 1.55; margin: 0; }

        .eco-impact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        .eco-impact-card { background: #F9FBF9; border-radius: 14px; padding: 14px; }
        .eco-impact-card.full { grid-column: 1 / -1; }
        .eco-impact-icon { font-size: 22px; margin-bottom: 6px; }
        .eco-impact-value { font-size: 13px; font-weight: 700; color: #1B5E20; line-height: 1.4; margin: 0; }

        .eco-harm-box {
            background: #FFF8E1; border-left: 4px solid #F9A825;
            border-radius: 4px 14px 14px 4px; padding: 16px;
        }
        .eco-harm-label { font-size: 11px; font-weight: 800; color: #F57F17; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px; }
        .eco-harm-text { font-size: 14px; color: #5D4037; line-height: 1.6; margin: 0; }

        .eco-toast-footer { padding: 14px 22px 18px; border-top: 1px solid #F0F0F0; flex-shrink: 0; }
        .eco-scan-again-btn {
            width: 100%; background: #2E7D32; color: white; border: none;
            border-radius: 50px; padding: 13px; font-size: 15px; font-weight: 700;
            font-family: 'Outfit', sans-serif; cursor: pointer;
            transition: background 0.2s, transform 0.15s;
        }
        .eco-scan-again-btn:hover { background: #1B5E20; transform: translateY(-1px); }
        .eco-scan-again-btn:active { transform: translateY(0); }
    `;
    document.head.appendChild(s);
}

function showRichToast(type, conf) {
    injectToastStyles();
    document.getElementById('eco-toast-overlay')?.remove();

    const data = wasteData[type];
    if (!data) { showSimpleToast('success', `${type} detected!`, 'Follow local barangay guidelines.'); return; }

    const confPct = Math.round(conf * 100);

    const overlay = document.createElement('div');
    overlay.id = 'eco-toast-overlay';

    const stepsHtml = data.process.map((s, i) => `
        <div class="eco-step">
            <div class="eco-step-num">${i + 1}</div>
            <p class="eco-step-text">${s}</p>
        </div>`).join('');

    overlay.innerHTML = `
        <div id="eco-toast-card">
            <div class="eco-toast-header">
                <div class="eco-toast-icon" style="background:${data.binBg}">${data.emoji}</div>
                <div class="eco-toast-title-group">
                    <p class="eco-toast-title">${type} Detected</p>
                    <p class="eco-toast-subtitle">${confPct}% confidence — saved to your history</p>
                    <div class="eco-toast-bin-pill" style="background:${data.binBg};color:${data.binColor};">
                        <div class="eco-toast-bin-dot" style="background:${data.binColor};"></div>
                        Dispose: ${data.bin}
                    </div>
                </div>
                <button class="eco-toast-close" id="eco-toast-close-btn">&times;</button>
            </div>

            <div class="eco-toast-tabs">
                <button class="eco-tab-btn active" data-tab="process">♻️ How to Recycle</button>
                <button class="eco-tab-btn" data-tab="impact">🌍 Impact</button>
                <button class="eco-tab-btn" data-tab="harm">⚠️ If Not Recycled</button>
            </div>

            <div class="eco-toast-body">
                <div class="eco-tab-panel active" id="eco-panel-process">
                    ${stepsHtml}
                </div>
                <div class="eco-tab-panel" id="eco-panel-impact">
                    <div class="eco-impact-grid">
                        <div class="eco-impact-card">
                            <div class="eco-impact-icon">🌱</div>
                            <p class="eco-impact-value">${data.impact.co2}</p>
                        </div>
                        <div class="eco-impact-card">
                            <div class="eco-impact-icon">💧</div>
                            <p class="eco-impact-value">${data.impact.water}</p>
                        </div>
                        <div class="eco-impact-card full">
                            <div class="eco-impact-icon">⚡</div>
                            <p class="eco-impact-value">${data.impact.stat}</p>
                        </div>
                    </div>
                </div>
                <div class="eco-tab-panel" id="eco-panel-harm">
                    <div class="eco-harm-box">
                        <p class="eco-harm-label">⚠️ Environmental Risk</p>
                        <p class="eco-harm-text">${data.harm}</p>
                    </div>
                </div>
            </div>

            <div class="eco-toast-footer">
                <button class="eco-scan-again-btn" id="eco-scan-again-btn">Scan Another Item</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.eco-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.eco-tab-btn').forEach(b => b.classList.remove('active'));
            overlay.querySelectorAll('.eco-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`eco-panel-${btn.dataset.tab}`)?.classList.add('active');
        });
    });

    const close = () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease';
        setTimeout(() => overlay.remove(), 200);
    };
    document.getElementById('eco-toast-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('eco-scan-again-btn').addEventListener('click', () => {
        close();
        unlockDetection();
    });
}

// ── Simple toast for errors ──
function showSimpleToast(type, title, subtitle = '') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none;width:min(420px,calc(100vw - 32px));';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    const iconColor = isSuccess ? '#2E7D32' : '#e74c3c';
    const iconBg    = isSuccess ? '#E8F5E9'  : '#fdf0f0';
    const iconPath  = isSuccess
        ? `<path d="M3 8l3.5 3.5L13 4.5" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="M4 4l8 8M12 4l-8 8" stroke="${iconColor}" stroke-width="2" stroke-linecap="round"/>`;
    toast.style.cssText = `display:flex;align-items:flex-start;gap:14px;background:#fff;border:1px solid #e0e0e0;border-left:4px solid ${iconColor};border-radius:4px 16px 16px 4px;padding:16px 20px;pointer-events:auto;opacity:0;transform:translateY(20px) scale(0.96);transition:opacity 0.28s ease,transform 0.28s ease;width:100%;box-shadow:0 8px 28px rgba(0,0,0,0.12);box-sizing:border-box;font-family:'Outfit',sans-serif;`;
    toast.innerHTML = `
        <div style="width:38px;height:38px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">${iconPath}</svg>
        </div>
        <div style="flex:1;min-width:0;">
            <p style="margin:0 0 4px;font-weight:700;font-size:15px;color:#1a1a1a;">${title}</p>
            ${subtitle ? `<p style="margin:0;font-size:13px;color:#555;line-height:1.5;">${subtitle}</p>` : ''}
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#aaa;font-size:20px;padding:0;line-height:1;flex-shrink:0;">&times;</button>`;
    container.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0) scale(1)';
    }));
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.96)';
        setTimeout(() => toast.remove(), 300);
    }, 7000);
}

// ══════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════
function setIdentifyBtnState(enabled) {
    const btn = document.getElementById('identify-waste-btn');
    if (!btn) return;
    btn.disabled        = !enabled;
    btn.style.opacity   = enabled ? '1'       : '0.45';
    btn.style.cursor    = enabled ? 'pointer' : 'not-allowed';
    btn.style.transform = enabled ? ''        : 'none';
}

function renderLockedLabel(type, conf) {
    if (!labelContainer) return;
    const pct = Math.round(conf * 100);
    labelContainer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">
            <span style="display:inline-flex;align-items:center;gap:6px;background:#E8F5E9;color:#1B5E20;border-radius:50px;padding:4px 14px;font-size:0.85rem;font-weight:800;">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4.5" stroke="#2E7D32" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                LOCKED
            </span>
            <strong style="font-size:1.35rem;">${type}</strong>
            <span style="font-size:0.85rem;color:#888;font-weight:600;">${pct}% confident</span>
        </div>`;
}

function renderScanningLabel() {
    if (!labelContainer) return;
    labelContainer.innerHTML = `<span style="color:#9E9E9E;font-size:1rem;font-weight:500;">Scanning… aim at an object</span>`;
}

function renderDetectingLabel(type, conf) {
    if (!labelContainer) return;
    const pct = Math.round(conf * 100);
    labelContainer.innerHTML = `Detected: <strong>${type}</strong> <span style="font-size:0.85rem;color:#666;">(${pct}%)</span>`;
}

// ══════════════════════════════════════════
// LOCK / UNLOCK
// ══════════════════════════════════════════
function lockDetection(type, conf) {
    locked        = true;
    lockedType    = type;
    lockedConf    = conf;
    neutralFrames = 0;

    const data = wasteData[type];
    renderLockedLabel(type, conf);

    const instructions = document.getElementById('disposal-instructions');
    if (instructions && data) {
        instructions.innerHTML = `
            <span style="display:inline-block;background:${data.binColor};color:white;border-radius:50px;
                padding:2px 12px;font-size:0.75rem;font-weight:700;margin-bottom:6px;">${data.bin}</span><br>
            ${data.process[0]}`;
    }

    setIdentifyBtnState(true);

    const line = document.getElementById('scanner-line');
    if (line) { line.style.background = '#2E7D32'; line.style.boxShadow = '0 0 15px #2E7D32'; }
}

function unlockDetection() {
    locked        = false;
    lockedType    = "";
    lockedConf    = 0;
    neutralFrames = 0;

    renderScanningLabel();

    const instructions = document.getElementById('disposal-instructions');
    if (instructions) instructions.innerText = "Align the item in the center to identify.";

    setIdentifyBtnState(false);

    const line = document.getElementById('scanner-line');
    if (line) { line.style.background = 'var(--dark-green,#1B5E20)'; line.style.boxShadow = '0 0 15px var(--dark-green,#1B5E20)'; }
}

// ══════════════════════════════════════════
// DOM READY
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const modal       = document.getElementById('ai-modal');
    const closeBtn    = document.getElementById('close-ai-modal');
    const identifyBtn = document.getElementById('identify-waste-btn');
    const openBtn     = document.querySelector('.hero-banner .btn-scan-now');

    setIdentifyBtnState(false);

    if (openBtn) {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('active');
            modal.style.display = 'flex';
            unlockDetection();
            initAI();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.remove('active');
            modal.style.display = 'none';
            if (webcam) webcam.stop();
            unlockDetection();
        });
    }

    if (identifyBtn) {
        identifyBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!locked || !lockedType) {
                showSimpleToast('error', 'Nothing locked yet', 'Point the camera at an object and wait for the green LOCKED badge.');
                return;
            }

            const capturedImage = webcam.canvas.toDataURL('image/jpeg', 0.7);
            const savedType     = lockedType;
            const savedConf     = lockedConf;

            const user = auth.currentUser;
            if (user) {
                try {
                    await addDoc(collection(db, "scans"), {
                        userId: user.uid, itemName: savedType, category: savedType,
                        itemImage: capturedImage, points: 5, timestamp: serverTimestamp()
                    });
                    await updateDoc(doc(db, "users", user.uid), {
                        scannedCount: increment(1), recycledCount: increment(1)
                    });
                } catch (error) { console.error("Error saving to Firebase:", error); }
            }

            const sEl = document.getElementById('scanned-count-ui');
            const rEl = document.getElementById('recycled-count-ui');
            if (sEl) { sEl.innerText = (parseInt(sEl.innerText) || 0) + 1; sEl.style.color = "#2ecc71"; setTimeout(() => sEl.style.color = "", 1000); }
            if (rEl) { rEl.innerText = (parseInt(rEl.innerText) || 0) + 1; rEl.style.color = "#2ecc71"; setTimeout(() => rEl.style.color = "", 1000); }

            showRichToast(savedType, savedConf);
        });
    }
});

// ══════════════════════════════════════════
// AI CORE
// ══════════════════════════════════════════
async function initAI() {
    labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = "Loading AI model…";

    model          = await tmImage.load(URL + "model.json", URL + "metadata.json");
    maxPredictions = model.getTotalClasses();

    const flip = true;
    webcam = new tmImage.Webcam(400, 400, flip);
    await webcam.setup();
    await webcam.play();

    window.requestAnimationFrame(loop);
    document.getElementById("webcam").srcObject = webcam.webcam.srcObject;
    renderScanningLabel();
}

async function loop() {
    if (webcam && webcam.canvas) {
        webcam.update();
        await predict();
        window.requestAnimationFrame(loop);
    }
}

async function predict() {
    if (!model) return;

    const prediction = await model.predict(webcam.canvas);
    let highestProb = 0, bestResult = "";
    for (let i = 0; i < maxPredictions; i++) {
        if (prediction[i].probability > highestProb) {
            highestProb = prediction[i].probability;
            bestResult  = prediction[i].className;
        }
    }

    if (locked) {
        if (bestResult === "Neutral" || highestProb < 0.75) {
            if (++neutralFrames >= NEUTRAL_UNLOCK_FRAMES) unlockDetection();
        } else {
            neutralFrames = 0;
        }
        return;
    }

    if (highestProb > 0.80 && bestResult !== "Neutral") {
        lockDetection(bestResult, highestProb);
    } else if (highestProb > 0.55 && bestResult !== "Neutral") {
        renderDetectingLabel(bestResult, highestProb);
        const el = document.getElementById('disposal-instructions');
        if (el) el.innerText = "Hold steady to lock…";
    } else {
        renderScanningLabel();
        const el = document.getElementById('disposal-instructions');
        if (el) el.innerText = "Align the item in the center to identify.";
    }
}