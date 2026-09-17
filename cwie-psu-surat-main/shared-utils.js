/* ============================================================
   CWIE PSU Surat Thani — Shared Utilities  v2.1 (Patched)
   ------------------------------------------------------------
   ฟังก์ชันที่ใช้ร่วมกันทั้ง admin.js และ dashboard.js
   ต้องโหลด <script> ไฟล์นี้ "ก่อน" admin.js และ dashboard.js เสมอ
   ============================================================ */

'use strict';

// ─── XSS Prevention ──────────────────────────────────────────

/**
 * แปลงข้อความให้ปลอดภัยก่อนแทรกลงใน DOM (อุดช่องโหว่ XSS 100%)
 * ใช้ Regex แปลงอักขระพิเศษรวมถึง ' และ " เพื่อให้ปลอดภัยแม้ใช้ใน Attribute
 * @param {any} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * ตรวจสอบและ sanitize URL ก่อนใส่ใน href
 * กัน javascript: URI และ data: URI แม้มี whitespace นำหน้าหรือ encoding แปลก
 * @param {string|null|undefined} url
 * @returns {string|null} URL ที่ปลอดภัย หรือ null ถ้าไม่ผ่าน
 */
function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.href;
    } catch {
        return null;
    }
}

// ─── Job Status ───────────────────────────────────────────────

const CLOSED_STATUS_SET = new Set(['ปิดรับสมัครแล้ว', 'ปิดรับสมัคร', 'ปิด']);

function isJobClosed(status) {
    return CLOSED_STATUS_SET.has(status);
}

function statusPillHtml(status) {
    const closed = isJobClosed(status);
    const label  = closed ? 'ปิดรับสมัคร' : 'เปิดรับสมัคร';
    const cls    = closed ? 'status-pill--closed' : 'status-pill--open';
    return `<span class="status-pill ${cls}"><span class="dot"></span>${label}</span>`;
}

// ─── Company Avatar ───────────────────────────────────────────

const AVATAR_PALETTE = Object.freeze([
    '#003C71', '#315DAE', '#009CDE', '#0E9F6E', '#7C6FE0', '#DB6E2C',
]);

function getCompanyAvatar(name) {
    const safeName = String(name ?? '').trim() || '?';
    const initial  = safeName.charAt(0).toUpperCase();
    let   hash     = 0;
    for (let i = 0; i < safeName.length; i++) {
        hash = (safeName.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    return { initial, color: AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length] };
}

// ─── Table State Helpers ──────────────────────────────────────

function loadingRowHtml(colspan, text) {
    return `<tr><td colspan="${Number(colspan)}"><div class="loading-state">
        <span class="loading-spinner"></span>
        <span>${escapeHtml(text ?? 'กำลังโหลดข้อมูล...')}</span>
    </div></td></tr>`;
}

function emptyRowHtml(colspan, text) {
    return `<tr><td colspan="${Number(colspan)}">
        <div class="empty-state">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                <path d="M3.3 7 12 12l8.7-5M12 22V12"/>
            </svg>
            <span>${escapeHtml(text ?? 'ไม่พบข้อมูล')}</span>
        </div>
    </td></tr>`;
}

function skeletonRowsHtml(colspan, rows = 4) {
    const widths = [78, 55, 40, 62, 35, 50, 45];
    let out = '';
    for (let r = 0; r < rows; r++) {
        out += '<tr>';
        for (let c = 0; c < colspan; c++) {
            out += `<td><div class="skeleton-bar" style="width:${widths[(r + c) % widths.length]}%;"></div></td>`;
        }
        out += '</tr>';
    }
    return out;
}

// ─── Utilities ────────────────────────────────────────────────

function debounce(fn, delay = 200) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function renderPagination(container, opts) {
    if (!container) return;

    const { currentPage, onChange } = opts;
    const totalPages = Math.max(opts.totalPages, 1);

    container.innerHTML = '';

    const mkBtn = (label, page, disabled, active) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.type        = 'button';
        btn.setAttribute('aria-label', label);
        if (active) btn.setAttribute('aria-current', 'page');
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold ' + (
            disabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
            : active  ? 'bg-psublue text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-psublue hover:text-white'
        );
        btn.disabled = !!disabled;
        if (!disabled) btn.addEventListener('click', () => onChange(page));
        return btn;
    };

    container.appendChild(mkBtn('‹ ก่อนหน้า', currentPage - 1, currentPage <= 1, false));

    let lastRendered = 0;
    for (let i = 1; i <= totalPages; i++) {
        const isEdge = i === 1 || i === totalPages;
        const isNear = i >= currentPage - 1 && i <= currentPage + 1;
        if (!isEdge && !isNear) continue;

        if (lastRendered && i - lastRendered > 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '…';
            ellipsis.className   = 'page-ellipsis';
            ellipsis.setAttribute('aria-hidden', 'true');
            container.appendChild(ellipsis);
        }
        container.appendChild(mkBtn(String(i), i, false, i === currentPage));
        lastRendered = i;
    }

    container.appendChild(mkBtn('ถัดไป ›', currentPage + 1, currentPage >= totalPages, false));
}
