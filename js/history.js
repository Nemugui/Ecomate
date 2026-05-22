import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    getDocs, 
    Timestamp,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ══════════════════════════════════════════
// WASTE DATA — mirrors ai-scanner.js
// ══════════════════════════════════════════
const wasteData = {
    "Plastic": {
        bin: "Blue Bin", binColor: "#1565C0", binBg: "#E3F2FD", emoji: "♻️",
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
        bin: "Blue Bin", binColor: "#1565C0", binBg: "#E3F2FD", emoji: "📄",
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
        bin: "Blue Bin", binColor: "#1565C0", binBg: "#E3F2FD", emoji: "🥫",
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
        bin: "Blue Bin", binColor: "#1565C0", binBg: "#E3F2FD", emoji: "🫙",
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
        bin: "Green Bin", binColor: "#2E7D32", binBg: "#E8F5E9", emoji: "🌿",
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

// Global states
let currentTab       = 'scanned';
let dateRange        = 30;
let selectedCategory = 'All';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        injectAllStyles();
        injectDetailModal();
        injectRichModal();
        setupTabListeners();
        setupFilterListeners();
        loadHistoryData(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// ══════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════
function injectAllStyles() {
    if (document.getElementById('hist-all-styles')) return;
    const style = document.createElement('style');
    style.id = 'hist-all-styles';
    style.textContent = `
        @keyframes histModalPop {
            from { opacity:0; transform:scale(0.92) translateY(16px); }
            to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes richSheetIn {
            from { opacity:0; transform:translateY(48px); }
            to   { opacity:1; transform:translateY(0); }
        }

        /* ── OLD simple modal (reports) ── */
        #hist-detail-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(0,0,0,0.45); z-index:600;
            align-items:center; justify-content:center; padding:1rem;
        }
        #hist-detail-card {
            background:#fff; border-radius:28px; width:100%; max-width:440px;
            box-shadow:0 24px 60px rgba(0,0,0,0.18); overflow:hidden;
            animation:histModalPop 0.28s cubic-bezier(0.34,1.56,0.64,1);
            font-family:'Outfit',sans-serif;
        }
        #hist-detail-img { width:100%; height:220px; object-fit:cover; display:block; }
        .hm-no-img {
            width:100%; height:160px;
            background:linear-gradient(135deg,#E8F5E9,#C8E6C9);
            display:flex; align-items:center; justify-content:center; font-size:3rem;
        }
        .hm-body { padding:1.75rem; }
        .hm-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem; }
        .hm-title { font-size:1.3rem; font-weight:700; color:#1B5E20; margin:0; flex:1; padding-right:1rem; }
        .hm-x {
            background:#F5F5F5; border:none; border-radius:50%;
            width:32px; height:32px; cursor:pointer; font-size:1rem; color:#546E7A;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .hm-row { display:flex; align-items:flex-start; gap:0.75rem; padding:0.75rem 0; border-bottom:1px solid #F5F5F5; }
        .hm-row:last-of-type { border-bottom:none; }
        .hm-label { font-size:0.6rem; font-weight:800; letter-spacing:0.8px; text-transform:uppercase; color:#9E9E9E; min-width:90px; padding-top:2px; }
        .hm-value { font-size:0.9rem; font-weight:600; color:#263238; flex:1; }
        .hm-badge { display:inline-block; padding:3px 12px; border-radius:20px; font-size:0.6rem; font-weight:800; text-transform:uppercase; }
        .hm-badge.plastic  { background:#E8F5E9; color:#2E7D32; }
        .hm-badge.organic  { background:#FFF3E0; color:#E65100; }
        .hm-badge.paper    { background:#F1F8E9; color:#558B2F; }
        .hm-badge.hazard   { background:#FFEBEE; color:#C62828; }
        .hm-badge.rpt-pending  { background:#FFF3E0; color:#E65100; }
        .hm-badge.rpt-resolved { background:#E8F5E9; color:#2E7D32; }
        .hm-badge.rpt-ongoing  { background:#E3F2FD; color:#1E88E5; }
        .hm-close-btn {
            width:100%; margin-top:1.5rem; background:#2E7D32; color:white;
            border:none; padding:1rem; border-radius:50px; font-weight:700;
            font-size:1rem; cursor:pointer; font-family:'Outfit',sans-serif; transition:background 0.2s;
        }
        .hm-close-btn:hover { background:#1B5E20; }

        
      /* ── RICH scan modal (centered on desktop, bottom sheet on mobile) ── */
        #hist-rich-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(0,0,0,0.48); z-index:620;
            align-items:center; justify-content:center;
            padding:1rem;
        }
        #hist-rich-card {
            background:#fff;
            border-radius:28px;
            width:100%; max-width:560px;
            max-height:90vh;
            box-shadow:0 24px 60px rgba(0,0,0,0.22);
            overflow:hidden; display:flex; flex-direction:column;
            animation:richSheetIn 0.32s cubic-bezier(0.34,1.1,0.64,1);
            font-family:'Outfit',sans-serif;
        }

        /* drag pill */
        .hrich-pill {
            width:40px; height:4px; border-radius:4px;
            background:#E0E0E0; margin:12px auto 0; flex-shrink:0;
        }

        /* scanned image hero */
        .hrich-img-hero {
            width:100%; height:200px; object-fit:cover;
            display:block; flex-shrink:0;
        }
        .hrich-no-img {
            width:100%; height:140px; flex-shrink:0;
            display:flex; align-items:center; justify-content:center; font-size:3.5rem;
        }

        /* header row */
        .hrich-header {
            padding:16px 22px 10px;
            display:flex; align-items:flex-start; gap:14px; flex-shrink:0;
        }
        .hrich-icon {
            width:46px; height:46px; border-radius:14px;
            display:flex; align-items:center; justify-content:center;
            font-size:22px; flex-shrink:0;
        }
        .hrich-title-group { flex:1; min-width:0; }
        .hrich-title { font-size:19px; font-weight:700; color:#1a1a1a; margin:0 0 3px; }
        .hrich-subtitle { font-size:12px; color:#888; margin:0 0 8px; }
        .hrich-bin-pill {
            display:inline-flex; align-items:center; gap:6px;
            border-radius:50px; padding:4px 13px;
            font-size:11px; font-weight:700; letter-spacing:0.3px;
        }
        .hrich-bin-dot { width:7px; height:7px; border-radius:50%; }
        .hrich-close {
            background:#F5F5F5; border:none; border-radius:50%;
            width:32px; height:32px; font-size:18px; cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            color:#555; flex-shrink:0; transition:background 0.15s;
        }
        .hrich-close:hover { background:#E0E0E0; }

        /* meta strip */
        .hrich-meta-strip {
            display:flex; gap:8px; padding:0 22px 14px; flex-wrap:wrap; flex-shrink:0;
        }
        .hrich-meta-chip {
            background:#F5F7F5; border-radius:10px; padding:6px 12px;
            display:flex; flex-direction:column; gap:1px;
        }
        .hrich-chip-label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; color:#9E9E9E; }
        .hrich-chip-val   { font-size:12px; font-weight:700; color:#263238; }

        /* tabs */
        .hrich-tabs {
            display:flex; gap:4px; padding:0 22px;
            border-bottom:1px solid #F0F0F0; flex-shrink:0;
        }
        .hrich-tab-btn {
            padding:10px 13px; font-size:11px; font-weight:700;
            border:none; background:none; cursor:pointer; color:#999;
            border-bottom:2px solid transparent; margin-bottom:-1px;
            letter-spacing:0.3px; text-transform:uppercase;
            font-family:'Outfit',sans-serif; white-space:nowrap;
            transition:color 0.15s, border-color 0.15s;
        }
        .hrich-tab-btn.active { color:#2E7D32; border-bottom-color:#2E7D32; }

      
       /* body */
        .hrich-body {
            overflow-y:auto; flex:1; padding:18px 22px 16px;
            -webkit-overflow-scrolling:touch;
            min-height:0;
        }
        .hrich-body::-webkit-scrollbar { width:3px; }
        .hrich-body::-webkit-scrollbar-thumb { background:#ddd; border-radius:3px; }

        .hrich-panel { display:none; }
        .hrich-panel.active { display:block; }

        /* process steps */
        .hrich-step { display:flex; gap:12px; align-items:flex-start; margin-bottom:13px; }
        .hrich-step:last-child { margin-bottom:0; }
        .hrich-step-num {
            width:25px; height:25px; border-radius:50%;
            background:#E8F5E9; color:#2E7D32;
            font-size:11px; font-weight:800;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .hrich-step-text { font-size:13px; color:#333; line-height:1.55; margin:3px 0 0; }

        /* impact grid */
        .hrich-impact-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .hrich-impact-card { background:#F9FBF9; border-radius:13px; padding:13px; }
        .hrich-impact-card.full { grid-column:1/-1; }
        .hrich-impact-icon { font-size:20px; margin-bottom:5px; }
        .hrich-impact-val { font-size:12px; font-weight:700; color:#1B5E20; line-height:1.4; margin:0; }

        /* harm box */
        .hrich-harm-box {
            background:#FFF8E1; border-left:4px solid #F9A825;
            border-radius:4px 13px 13px 4px; padding:15px;
        }
        .hrich-harm-label { font-size:10px; font-weight:800; color:#F57F17; text-transform:uppercase; letter-spacing:0.8px; margin:0 0 7px; }
        .hrich-harm-text { font-size:13px; color:#5D4037; line-height:1.6; margin:0; }

        /* footer */
        .hrich-footer { padding:12px 22px 20px; border-top:1px solid #F0F0F0; flex-shrink:0; }
        .hrich-close-btn {
            width:100%; background:#2E7D32; color:white; border:none;
            border-radius:50px; padding:13px; font-size:14px; font-weight:700;
            font-family:'Outfit',sans-serif; cursor:pointer;
            transition:background 0.2s;
        }
        .hrich-close-btn:hover { background:#1B5E20; }

        /* card clickable area */
        .history-card { cursor:pointer; }
        .history-card:active { transform:scale(0.99); }

        /* ── 3-dot dropdown ── */
        .dot-menu-wrapper { position:relative; }
        .dot-dropdown {
            display:none; position:absolute; right:0; top:calc(100% + 6px);
            background:white; border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,0.12);
            min-width:160px; z-index:400; overflow:hidden;
        }
        .dot-dropdown.open { display:block; }
        .dot-dropdown button {
            width:100%; background:none; border:none; padding:0.85rem 1.25rem;
            text-align:left; font-size:0.88rem; font-weight:600; color:#263238;
            cursor:pointer; font-family:'Outfit',sans-serif;
            display:flex; align-items:center; gap:0.75rem; transition:background 0.15s;
        }
        .dot-dropdown button:hover { background:#F1F8E9; color:#1B5E20; }
        .dot-dropdown button.danger { color:#C62828; }
        .dot-dropdown button.danger:hover { background:#FFEBEE; }
        .dot-dropdown hr { border:none; border-top:1px solid #F5F5F5; margin:0; }

        /* delete confirm */
        #hist-confirm-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(0,0,0,0.45); z-index:700;
            align-items:center; justify-content:center; padding:1rem;
        }
        #hist-confirm-card {
            background:white; border-radius:24px; padding:2rem; max-width:360px; width:100%;
            font-family:'Outfit',sans-serif; box-shadow:0 24px 60px rgba(0,0,0,0.18);
            text-align:center; animation:histModalPop 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .hc-icon { width:56px; height:56px; border-radius:50%; background:#FFEBEE; margin:0 auto 1rem; display:flex; align-items:center; justify-content:center; font-size:1.5rem; }
        #hist-confirm-card h3 { font-size:1.15rem; font-weight:700; color:#263238; margin-bottom:0.5rem; }
        #hist-confirm-card p  { font-size:0.875rem; color:#546E7A; margin-bottom:1.5rem; }
        .hc-btns { display:flex; gap:0.75rem; }
        .hc-cancel { flex:1; background:#F5F5F5; color:#546E7A; border:none; padding:0.9rem; border-radius:50px; font-weight:700; font-size:0.9rem; cursor:pointer; font-family:'Outfit',sans-serif; }
        .hc-delete { flex:1; background:#C62828; color:white; border:none; padding:0.9rem; border-radius:50px; font-weight:700; font-size:0.9rem; cursor:pointer; font-family:'Outfit',sans-serif; transition:background 0.2s; }
        .hc-delete:hover { background:#B71C1C; }
    `;
    document.head.appendChild(style);
}

// ══════════════════════════════════════════
// INJECT MODALS
// ══════════════════════════════════════════
function injectDetailModal() {
    if (document.getElementById('hist-detail-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'hist-detail-overlay';
    overlay.innerHTML = `
        <div id="hist-detail-card">
            <div id="hist-detail-img-wrap"></div>
            <div class="hm-body">
                <div class="hm-top">
                    <h3 class="hm-title" id="hm-title">—</h3>
                    <button class="hm-x" id="hm-x">✕</button>
                </div>
                <div id="hm-rows"></div>
                <button class="hm-close-btn" id="hm-close-btn">Close</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const confirmOverlay = document.createElement('div');
    confirmOverlay.id = 'hist-confirm-overlay';
    confirmOverlay.innerHTML = `
        <div id="hist-confirm-card">
            <div class="hc-icon">🗑️</div>
            <h3>Delete this record?</h3>
            <p>This will permanently remove it from your history. This cannot be undone.</p>
            <div class="hc-btns">
                <button class="hc-cancel" id="hc-cancel">Cancel</button>
                <button class="hc-delete" id="hc-confirm-delete">Delete</button>
            </div>
        </div>`;
    document.body.appendChild(confirmOverlay);

    document.getElementById('hm-x').addEventListener('click', closeDetailModal);
    document.getElementById('hm-close-btn').addEventListener('click', closeDetailModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDetailModal(); });
    document.getElementById('hc-cancel').addEventListener('click', closeConfirmModal);
    confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirmModal(); });
}

function injectRichModal() {
    if (document.getElementById('hist-rich-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'hist-rich-overlay';
    overlay.innerHTML = `
        <div id="hist-rich-card">
            <div class="hrich-pill"></div>
            <div id="hrich-img-wrap"></div>
            <div class="hrich-header">
                <div class="hrich-icon" id="hrich-icon"></div>
                <div class="hrich-title-group">
                    <p class="hrich-title"  id="hrich-title">—</p>
                    <p class="hrich-subtitle" id="hrich-subtitle">—</p>
                    <div class="hrich-bin-pill" id="hrich-bin-pill">
                        <div class="hrich-bin-dot" id="hrich-bin-dot"></div>
                        <span id="hrich-bin-label">—</span>
                    </div>
                </div>
                <button class="hrich-close" id="hrich-x">&times;</button>
            </div>
            <div class="hrich-meta-strip" id="hrich-meta-strip"></div>
            <div class="hrich-tabs">
                <button class="hrich-tab-btn active" data-panel="process">♻️ How to Recycle</button>
                <button class="hrich-tab-btn"        data-panel="impact" >🌍 Impact</button>
                <button class="hrich-tab-btn"        data-panel="harm"   >⚠️ If Not Recycled</button>
            </div>
            <div class="hrich-body">
                <div class="hrich-panel active" id="hrich-panel-process"></div>
                <div class="hrich-panel"        id="hrich-panel-impact"></div>
                <div class="hrich-panel"        id="hrich-panel-harm"></div>
            </div>
            <div class="hrich-footer">
                <button class="hrich-close-btn" id="hrich-close-btn">Close</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.style.display = 'none'; };
    document.getElementById('hrich-x').addEventListener('click', close);
    document.getElementById('hrich-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.hrich-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.hrich-tab-btn').forEach(b => b.classList.remove('active'));
            overlay.querySelectorAll('.hrich-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`hrich-panel-${btn.dataset.panel}`)?.classList.add('active');
        });
    });
}

// ══════════════════════════════════════════
// OPEN RICH SCAN MODAL
// ══════════════════════════════════════════
function openRichModal(data) {
    const category = data.category || data.itemName || '';
    const wData    = wasteData[category];
    const overlay  = document.getElementById('hist-rich-overlay');

    // Reset tabs to first
    overlay.querySelectorAll('.hrich-tab-btn').forEach((b,i) => b.classList.toggle('active', i===0));
    overlay.querySelectorAll('.hrich-panel').forEach((p,i) => p.classList.toggle('active', i===0));

    // Image / hero
    const imgWrap = document.getElementById('hrich-img-wrap');
    if (data.itemImage) {
        imgWrap.innerHTML = `<img class="hrich-img-hero" src="${data.itemImage}" alt="${category}"
            onerror="this.parentElement.innerHTML='<div class=hrich-no-img>${wData?.emoji||'♻️'}</div>'">`;
    } else {
        imgWrap.innerHTML = `<div class="hrich-no-img">${wData?.emoji||'♻️'}</div>`;
    }

    // Header
    document.getElementById('hrich-title').textContent   = data.itemName || category || 'Scanned Item';
    document.getElementById('hrich-subtitle').textContent = data.timestamp
        ? 'Scanned on ' + data.timestamp.toDate().toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'})
        : 'Scanned item';

    const iconEl = document.getElementById('hrich-icon');
    iconEl.textContent = wData?.emoji || '♻️';
    iconEl.style.background = wData?.binBg || '#E8F5E9';

    const pillEl    = document.getElementById('hrich-bin-pill');
    const dotEl     = document.getElementById('hrich-bin-dot');
    const labelEl   = document.getElementById('hrich-bin-label');
    const binColor  = wData?.binColor || '#2E7D32';
    const binBg     = wData?.binBg    || '#E8F5E9';
    pillEl.style.background = binBg;
    pillEl.style.color      = binColor;
    dotEl.style.background  = binColor;
    labelEl.textContent     = wData ? `Dispose: ${wData.bin}` : 'Dispose properly';

    // Meta chips
    const tl = data.timestamp
        ? data.timestamp.toDate().toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric'})
        : 'Unknown date';
    document.getElementById('hrich-meta-strip').innerHTML = `
        <div class="hrich-meta-chip">
            <span class="hrich-chip-label">Points</span>
            <span class="hrich-chip-val">+${data.points||5} pts</span>
        </div>
        <div class="hrich-meta-chip">
            <span class="hrich-chip-label">Category</span>
            <span class="hrich-chip-val">${category||'—'}</span>
        </div>
        <div class="hrich-meta-chip">
            <span class="hrich-chip-label">Date</span>
            <span class="hrich-chip-val">${tl}</span>
        </div>`;

    if (wData) {
        // Process steps
        document.getElementById('hrich-panel-process').innerHTML =
            wData.process.map((s,i) => `
                <div class="hrich-step">
                    <div class="hrich-step-num">${i+1}</div>
                    <p class="hrich-step-text">${s}</p>
                </div>`).join('');

        // Impact
        document.getElementById('hrich-panel-impact').innerHTML = `
            <div class="hrich-impact-grid">
                <div class="hrich-impact-card"><div class="hrich-impact-icon">🌱</div><p class="hrich-impact-val">${wData.impact.co2}</p></div>
                <div class="hrich-impact-card"><div class="hrich-impact-icon">💧</div><p class="hrich-impact-val">${wData.impact.water}</p></div>
                <div class="hrich-impact-card full"><div class="hrich-impact-icon">⚡</div><p class="hrich-impact-val">${wData.impact.stat}</p></div>
            </div>`;

        // Harm
        document.getElementById('hrich-panel-harm').innerHTML = `
            <div class="hrich-harm-box">
                <p class="hrich-harm-label">⚠️ Environmental Risk</p>
                <p class="hrich-harm-text">${wData.harm}</p>
            </div>`;
    } else {
        const fallback = '<p style="font-size:13px;color:#546E7A;line-height:1.6;">Follow local barangay guidelines for proper disposal of this material.</p>';
        document.getElementById('hrich-panel-process').innerHTML = fallback;
        document.getElementById('hrich-panel-impact').innerHTML  = fallback;
        document.getElementById('hrich-panel-harm').innerHTML    = fallback;
    }

    overlay.style.display = 'flex';
}

// ══════════════════════════════════════════
// REPORT DETAIL MODAL (unchanged)
// ══════════════════════════════════════════
function openDetailModal(data, type) {
    const imgWrap = document.getElementById('hist-detail-img-wrap');
    const titleEl = document.getElementById('hm-title');
    const rowsEl  = document.getElementById('hm-rows');
    const imgSrc  = type === 'scanned' ? data.itemImage : data.imageUrl;

    imgWrap.innerHTML = imgSrc
        ? `<img id="hist-detail-img" src="${imgSrc}" alt="photo"
              onerror="this.parentElement.innerHTML='<div class=hm-no-img>${type==='scanned'?'♻️':'📋'}</div>'">`
        : `<div class="hm-no-img">${type === 'scanned' ? '♻️' : '📋'}</div>`;

    if (type === 'scanned') {
        titleEl.textContent = data.itemName || 'Scanned Item';
        const bc = getBadgeClass(data.category);
        const tl = data.timestamp
            ? data.timestamp.toDate().toLocaleString('en-PH',{dateStyle:'long',timeStyle:'short'})
            : 'Just now';
        rowsEl.innerHTML = buildRows([
            { label:'Category', value:`<span class="hm-badge ${bc}">${data.category||'—'}</span>` },
            { label:'Points',   value:`+${data.points||5} pts earned` },
            { label:'Scanned',  value: tl },
            { label:'Tip',      value: data.disposalTip||data.tip||'Dispose properly at your nearest recycling center.' },
        ]);
    } else {
        titleEl.textContent = `${data.wasteType||'Waste'} Report`;
        const st = (data.status||'pending').toLowerCase();
        rowsEl.innerHTML = buildRows([
            { label:'Status',      value:`<span class="hm-badge rpt-${st}">${st.toUpperCase()}</span>` },
            { label:'Type',        value: data.wasteType   || '—' },
            { label:'Location',    value: data.location    || '—' },
            { label:'Description', value: data.description || 'No description.' },
            { label:'Submitted',   value: formatFirebaseDate(data.timestamp) },
        ]);
    }

    document.getElementById('hist-detail-overlay').style.display = 'flex';
}

function buildRows(rows) {
    return rows.map(r =>
        `<div class="hm-row"><span class="hm-label">${r.label}</span><span class="hm-value">${r.value}</span></div>`
    ).join('');
}

function closeDetailModal() { document.getElementById('hist-detail-overlay').style.display = 'none'; }

// ══════════════════════════════════════════
// DELETE CONFIRM
// ══════════════════════════════════════════
let pendingDeleteId = null, pendingDeleteCard = null, pendingDeleteCol = null;

function openConfirmModal(docId, cardEl, collectionName) {
    pendingDeleteId   = docId;
    pendingDeleteCard = cardEl;
    pendingDeleteCol  = collectionName;
    const btn    = document.getElementById('hc-confirm-delete');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', executeDelete);
    document.getElementById('hist-confirm-overlay').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('hist-confirm-overlay').style.display = 'none';
    pendingDeleteId = pendingDeleteCard = pendingDeleteCol = null;
}

async function executeDelete() {
    if (!pendingDeleteId || !pendingDeleteCol) return;
    try {
        await deleteDoc(doc(db, pendingDeleteCol, pendingDeleteId));
        if (pendingDeleteCard) {
            pendingDeleteCard.style.transition = 'opacity 0.3s, transform 0.3s';
            pendingDeleteCard.style.opacity    = '0';
            pendingDeleteCard.style.transform  = 'translateX(30px)';
            setTimeout(() => pendingDeleteCard.remove(), 300);
        }
        closeConfirmModal();
    } catch (err) { console.error('Delete failed:', err); closeConfirmModal(); }
}

document.addEventListener('click', () => {
    document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
});

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════
function setupTabListeners() {
    const scanTab   = document.getElementById('tab-scanned-items');
    const reportTab = document.getElementById('tab-reports');

    scanTab?.addEventListener('click', () => {
        if (currentTab === 'scanned') return;
        currentTab = 'scanned'; selectedCategory = 'All';
        updateTabUI(scanTab, reportTab);
        loadHistoryData(auth.currentUser.uid);
    });

    reportTab?.addEventListener('click', () => {
        if (currentTab === 'reports') return;
        currentTab = 'reports'; selectedCategory = 'All';
        updateTabUI(reportTab, scanTab);
        loadHistoryData(auth.currentUser.uid);
    });
}

function updateTabUI(active, inactive) {
    active.classList.replace('inactive','active');
    inactive.classList.replace('active','inactive');
    const span = document.getElementById('filter-category-btn')?.querySelector('span');
    if (span) span.textContent = 'Category';
}

// ══════════════════════════════════════════
// FILTERS
// ══════════════════════════════════════════
function setupFilterListeners() {
    const catBtn   = document.getElementById('filter-category-btn');
    const catMenu  = document.getElementById('category-menu');
    const dateBtn  = document.getElementById('filter-date-btn');
    const dateMenu = document.getElementById('date-menu');

    catBtn?.addEventListener('click',  e => { e.stopPropagation(); catMenu.classList.toggle('show');  dateMenu.classList.remove('show'); });
    dateBtn?.addEventListener('click', e => { e.stopPropagation(); dateMenu.classList.toggle('show'); catMenu.classList.remove('show'); });

    catMenu?.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', () => {
            selectedCategory = item.getAttribute('data-value');
            if (catBtn.querySelector('span')) catBtn.querySelector('span').textContent = selectedCategory;
            catMenu.classList.remove('show');
            loadHistoryData(auth.currentUser.uid);
        });
    });

    dateMenu?.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', () => {
            dateRange = parseInt(item.getAttribute('data-days'));
            if (dateBtn.querySelector('span')) dateBtn.querySelector('span').textContent = `Last ${dateRange} Days`;
            dateMenu.classList.remove('show');
            loadHistoryData(auth.currentUser.uid);
        });
    });

    window.addEventListener('click', () => { catMenu?.classList.remove('show'); dateMenu?.classList.remove('show'); });
}

// ══════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════
async function loadHistoryData(uid) {
    const container = document.getElementById('history-items-container');
    if (!container) return;
    container.innerHTML = `<div class="loading-state"><p>Loading your history...</p></div>`;

    try {
        const collectionName = currentTab === 'scanned' ? 'scans' : 'reports';
        const userField      = currentTab === 'scanned' ? 'userId' : 'reporterUid';
        let constraints      = [where(userField, '==', uid)];

        if (dateRange !== 999) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - dateRange);
            constraints.push(where('timestamp', '>=', Timestamp.fromDate(cutoff)));
        }
        if (selectedCategory !== 'All') {
            constraints.push(where(currentTab === 'scanned' ? 'category' : 'wasteType', '==', selectedCategory));
        }
        constraints.push(orderBy('timestamp', 'desc'));

        const snap = await getDocs(query(collection(db, collectionName), ...constraints));
        container.innerHTML = '';

        if (snap.empty) {
            const rangeText = dateRange === 999 ? 'all time' : `the last ${dateRange} days`;
            container.innerHTML = `<div class="empty-state"><p>No ${selectedCategory !== 'All' ? selectedCategory : ''} items found for ${rangeText}.</p></div>`;
            updateMetrics(0, currentTab);
            return;
        }

        updateMetrics(snap.size, currentTab);
        snap.forEach(document => {
            const data = document.data();
            const card = currentTab === 'scanned'
                ? createScanCard(data, document.id, collectionName)
                : createReportCard(data, document.id, collectionName);
            container.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        console.error('Error loading history:', error);
        container.innerHTML = '<p class="error-msg">Failed to load data. Please check your Firestore indexes.</p>';
    }
}

// ══════════════════════════════════════════
// CARD GENERATORS
// ══════════════════════════════════════════
function getBadgeClass(category) {
    const c = (category || '').toLowerCase();
    if (c.includes('plastic'))                       return 'plastic';
    if (c.includes('paper'))                         return 'paper';
    if (c.includes('bio') || c.includes('organic'))  return 'organic';
    if (c.includes('haz'))                           return 'hazard';
    return 'plastic';
}

function createScanCard(data, docId, collName) {
    const card       = document.createElement('div');
    card.className   = 'history-card';
    const imageSrc   = data.itemImage || '';
    const badgeClass = getBadgeClass(data.category);
    const timeLabel  = data.timestamp
        ? data.timestamp.toDate().toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})
        : 'Just now';

    card.innerHTML = `
        <div class="item-thumb">
            ${imageSrc ? `<img src="${imageSrc}" alt="${data.itemName||'Scanned item'}"
                style="width:100%;height:100%;object-fit:cover;border-radius:20px;"
                onerror="this.style.display='none'">` : ''}
        </div>
        <div class="item-main">
            <div class="item-meta">
                <span class="item-badge ${badgeClass}">${data.category||'Item'}</span>
                <span class="item-time">${timeLabel}</span>
            </div>
            <div class="item-title">${data.itemName||'Scanned Item'}</div>
            <div class="item-tip">
                <i data-lucide="recycle" style="width:16px;height:16px;"></i>
                +${data.points||5} pts earned · Recyclable
            </div>
        </div>
        <div class="item-actions dot-menu-wrapper" id="dot-wrap-${docId}">
            <i data-lucide="more-vertical" style="width:20px;height:20px;cursor:pointer;"></i>
            <div class="dot-dropdown">
                <button class="dot-delete-btn danger">
                    <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Delete
                </button>
            </div>
        </div>`;

    // Clicking the card body opens the rich modal
    card.addEventListener('click', (e) => {
        // Don't open if clicking the 3-dot area
        const dotWrap = card.querySelector('.dot-menu-wrapper');
        if (dotWrap && dotWrap.contains(e.target)) return;
        openRichModal(data);
    });

    wireDotMenu(card, data, docId, collName, 'scanned');
    return card;
}

function createReportCard(data, docId, collName) {
    const card     = document.createElement('div');
    card.className = 'history-card';
    const imageSrc = data.imageUrl || '';
    const status   = (data.status || 'pending').toLowerCase();
    const timeLabel = formatFirebaseDate(data.timestamp);

    card.innerHTML = `
        <div class="item-thumb">
            ${imageSrc ? `<img src="${imageSrc}" alt="Report photo"
                style="width:100%;height:100%;object-fit:cover;border-radius:20px;"
                onerror="this.style.display='none'">` : ''}
        </div>
        <div class="item-main">
            <div class="item-meta">
                <span class="item-badge rpt-${status}">${status.toUpperCase()}</span>
                <span class="item-time">${timeLabel}</span>
            </div>
            <div class="item-title">${data.wasteType||'Waste'} Report</div>
            <div class="item-tip">
                <i data-lucide="map-pin" style="width:16px;height:16px;"></i>
                ${data.location||data.description||'No location provided.'}
            </div>
        </div>
        <div class="item-actions dot-menu-wrapper">
            <i data-lucide="more-vertical" style="width:20px;height:20px;cursor:pointer;"></i>
            <div class="dot-dropdown">
                <button class="dot-view-btn">
                    <i data-lucide="eye" style="width:16px;height:16px;"></i> View Details
                </button>
                <hr>
                <button class="dot-delete-btn danger">
                    <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Delete
                </button>
            </div>
        </div>`;

    // Report cards: click anywhere opens the simple detail modal
    card.addEventListener('click', (e) => {
        const dotWrap = card.querySelector('.dot-menu-wrapper');
        if (dotWrap && dotWrap.contains(e.target)) return;
        openDetailModal(data, 'reports');
    });

    wireDotMenu(card, data, docId, collName, 'reports');
    return card;
}

function wireDotMenu(card, data, docId, collName, type) {
    const wrapper   = card.querySelector('.dot-menu-wrapper');
    const icon      = wrapper.querySelector('[data-lucide="more-vertical"]');
    const dropdown  = wrapper.querySelector('.dot-dropdown');
    const viewBtn   = wrapper.querySelector('.dot-view-btn');
    const deleteBtn = wrapper.querySelector('.dot-delete-btn');

    icon.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.dot-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
        dropdown.classList.toggle('open');
    });

    dropdown.addEventListener('click', e => e.stopPropagation());

    viewBtn?.addEventListener('click', () => {
        dropdown.classList.remove('open');
        if (type === 'scanned') openRichModal(data);
        else openDetailModal(data, type);
    });

    deleteBtn.addEventListener('click', () => {
        dropdown.classList.remove('open');
        openConfirmModal(docId, card, collName);
    });
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function formatFirebaseDate(timestamp) {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})
         + ' • ' + date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

function updateMetrics(count, type) {
    if (type === 'scanned') document.getElementById('history-scanned-count').textContent  = count;
    if (type === 'reports') document.getElementById('history-submitted-count').textContent = count;
}